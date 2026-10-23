"""Daynote: a single-owner notes service. Runtime data never lives in source."""
import hashlib
import hmac
import io
import json
import os
from pathlib import Path
import re
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit
import zipfile
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

VERSION = "1.0.1"
TZ = ZoneInfo("Asia/Kolkata")
COOKIE = "daynote_session"
SESSION_SECONDS = 14 * 86400
STATIC = Path(__file__).parent / "static"


def utc_now():
    return datetime.now(timezone.utc)


def stamp(value):
    return value.isoformat(timespec="microseconds")


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    hashed = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=32768,
                            r=8, p=1, maxmem=128 * 1024 * 1024).hex()
    return f"scrypt:32768:8:1:{salt}:{hashed}"


def password_matches(password, stored):
    return hmac.compare_digest(password_hash(password, stored.split(":")[4]), stored)


class SetupBody(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=12, max_length=256)
    display_name: str = Field(default="Ajmal", min_length=1, max_length=60)


class LoginBody(BaseModel):
    password: str = Field(min_length=1, max_length=256)


class Item(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,80}$")
    text: str = Field(max_length=5000)
    done: bool = False


class NoteBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    mutation_id: str = Field(pattern=r"^[A-Za-z0-9_-]{16,100}$")
    base_revision: int = Field(ge=0)
    title: str = Field(default="", max_length=200)
    body: str = Field(default="", max_length=100000)
    color: Literal["plain", "sand", "sage", "lavender", "rose", "blue"] = "plain"
    label: str = Field(default="", max_length=80)
    kind: Literal["text", "checklist"] = "text"
    items: list[Item] = Field(default_factory=list, max_length=200)
    pinned: bool = False
    archived: bool = False
    deleted: bool = False


class DeleteBody(BaseModel):
    mutation_id: str = Field(pattern=r"^[A-Za-z0-9_-]{16,100}$")
    base_revision: int = Field(ge=1)


def create_app(data_dir=None, allowed_hosts=None, secure_cookie=None, personal_mode=None):
    data = Path(data_dir or os.getenv("DAYNOTE_DATA", "/data"))
    data.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(data, 0o700)
    database = data / "daynote.sqlite3"
    hosts = set(allowed_hosts or os.getenv("DAYNOTE_ALLOWED_HOSTS", "127.0.0.1:8240,localhost:8240,192.168.3.20:8240").split(","))
    secure = secure_cookie if secure_cookie is not None else os.getenv("DAYNOTE_SECURE_COOKIE", "false").lower() == "true"
    personal = personal_mode if personal_mode is not None else os.getenv("DAYNOTE_PERSONAL_MODE", "false").lower() == "true"

    @contextmanager
    def db():
        connection = sqlite3.connect(database, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=10000")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    with db() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("PRAGMA synchronous=FULL")
        version = con.execute("PRAGMA user_version").fetchone()[0]
        if version not in (0, 1):
            raise RuntimeError("Database version is newer than this application")
        con.executescript("""
          CREATE TABLE IF NOT EXISTS owner (
            id INTEGER PRIMARY KEY CHECK(id=1), display_name TEXT NOT NULL,
            password_hash TEXT NOT NULL, created_at TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS attempts (
            address TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL
          );
          CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY, document TEXT NOT NULL, revision INTEGER NOT NULL,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
            local_date TEXT NOT NULL, local_time TEXT NOT NULL,
            pinned INTEGER NOT NULL, archived INTEGER NOT NULL, deleted INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS notes_timeline ON notes(deleted, archived, local_date DESC, created_at DESC, id);
          CREATE TABLE IF NOT EXISTS mutations (
            id TEXT PRIMARY KEY, note_id TEXT NOT NULL, operation TEXT NOT NULL,
            created_at INTEGER NOT NULL
          );
          PRAGMA user_version=1;
        """)
    os.chmod(database, 0o600)
    setup_path = data / "setup-token"
    with db() as con:
        if not personal and not con.execute("SELECT 1 FROM owner").fetchone() and not setup_path.exists():
            fd = os.open(setup_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "w") as file:
                file.write(secrets.token_urlsafe(32))

    app = FastAPI(title="Daynote", version=VERSION, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.db = db
    app.state.data = data
    app.state.database = database

    @app.middleware("http")
    async def guard(request: Request, call_next):
        host = request.headers.get("host", "").lower()
        if host not in hosts:
            return JSONResponse({"detail": "Unknown host"}, status_code=400)
        if request.method in {"POST", "PUT", "DELETE", "PATCH"}:
            if request.headers.get("x-daynote-request") != "1":
                return JSONResponse({"detail": "Missing request protection"}, status_code=403)
            origin = request.headers.get("origin")
            if origin:
                parsed = urlsplit(origin)
                if parsed.netloc.lower() != host or parsed.scheme != request.url.scheme:
                    return JSONResponse({"detail": "Untrusted request origin"}, status_code=403)
            if request.headers.get("sec-fetch-site") == "cross-site":
                return JSONResponse({"detail": "Cross-site request blocked"}, status_code=403)
            try:
                length = int(request.headers.get("content-length", "0"))
            except ValueError:
                return JSONResponse({"detail": "Invalid request length"}, status_code=400)
            if length > 1_000_000:
                return JSONResponse({"detail": "Request is too large"}, status_code=413)
            if request.method != "GET" and length == 0:
                return JSONResponse({"detail": "A JSON request body is required"}, status_code=400)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        response.headers["Cache-Control"] = "no-store"
        return response

    def authenticated(request: Request):
        if personal:
            return {"personal_mode": True}
        token = request.cookies.get(COOKIE, "")
        with db() as con:
            session = con.execute("SELECT * FROM sessions WHERE token_hash=? AND expires>?", (digest(token), int(time.time()))).fetchone()
        if not session:
            raise HTTPException(401, "Please sign in")
        if request.method not in {"GET", "HEAD"} and not hmac.compare_digest(request.headers.get("x-csrf-token", ""), session["csrf"]):
            raise HTTPException(403, "Your session needs to be refreshed")
        return session

    def rate_limit(request, con):
        address = request.client.host if request.client else "unknown"
        now = int(time.time())
        row = con.execute("SELECT * FROM attempts WHERE address=?", (address,)).fetchone()
        if row and now - row["window_start"] < 900 and row["count"] >= 10:
            raise HTTPException(429, "Too many attempts. Try again in 15 minutes.")
        if not row or now - row["window_start"] >= 900:
            con.execute("INSERT OR REPLACE INTO attempts VALUES(?, 1, ?)", (address, now))
        else:
            con.execute("UPDATE attempts SET count=count+1 WHERE address=?", (address,))

    def new_session(con, response):
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        con.execute("DELETE FROM sessions WHERE expires<=?", (int(time.time()),))
        con.execute("INSERT INTO sessions VALUES(?,?,?)", (digest(token), csrf, int(time.time()) + SESSION_SECONDS))
        response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=secure, samesite="strict", path="/")
        return csrf

    def note_json(row):
        return {**json.loads(row["document"]), "id": row["id"], "revision": row["revision"],
                "createdAt": row["created_at"], "updatedAt": row["updated_at"],
                "date": row["local_date"], "time": row["local_time"], "creationTimezone": "Asia/Kolkata"}

    @app.get("/healthz")
    def health():
        with db() as con:
            con.execute("SELECT 1 FROM notes LIMIT 1").fetchone()
        return {"status": "ok", "version": VERSION}

    @app.get("/api/session")
    def session_status(request: Request):
        with db() as con:
            owner = con.execute("SELECT display_name FROM owner WHERE id=1").fetchone()
        if personal:
            return {"authenticated": True, "personal_mode": True, "display_name": owner["display_name"] if owner else "Ajmal", "csrf": "", "today": utc_now().astimezone(TZ).date().isoformat()}
        try:
            session = authenticated(request)
            return {"authenticated": True, "display_name": owner["display_name"], "csrf": session["csrf"], "today": utc_now().astimezone(TZ).date().isoformat()}
        except HTTPException:
            return {"authenticated": False, "setup_required": owner is None}

    @app.post("/api/setup")
    def setup(body: SetupBody, request: Request, response: Response):
        if personal:
            raise HTTPException(404, "Password setup is disabled in personal mode")
        # Rate-limit commits independently, including failed authentication.
        with db() as con:
            rate_limit(request, con)
        expected = setup_path.read_text().strip() if setup_path.exists() else ""
        if not expected or not hmac.compare_digest(body.token, expected):
            raise HTTPException(403, "The setup code is incorrect or has already been used")
        hashed = password_hash(body.password)
        with db() as con:
            con.execute("BEGIN IMMEDIATE")
            if con.execute("SELECT 1 FROM owner").fetchone():
                raise HTTPException(409, "This workspace is already set up")
            con.execute("INSERT INTO owner VALUES(1,?,?,?)", (body.display_name.strip() or "Ajmal", hashed, stamp(utc_now())))
            csrf = new_session(con, response)
            con.execute("DELETE FROM attempts")
        setup_path.unlink(missing_ok=True)
        return {"csrf": csrf}

    @app.post("/api/login")
    def login(body: LoginBody, request: Request, response: Response):
        if personal:
            raise HTTPException(404, "Sign-in is disabled in personal mode")
        with db() as con:
            rate_limit(request, con)
            owner = con.execute("SELECT * FROM owner WHERE id=1").fetchone()
        if not owner or not password_matches(body.password, owner["password_hash"]):
            raise HTTPException(401, "That password did not match")
        with db() as con:
            csrf = new_session(con, response)
            con.execute("DELETE FROM attempts WHERE address=?", (request.client.host if request.client else "unknown",))
        return {"csrf": csrf}

    @app.post("/api/logout")
    def logout(request: Request, response: Response, session=Depends(authenticated)):
        if personal:
            raise HTTPException(404, "Sign-out is disabled in personal mode")
        with db() as con:
            con.execute("DELETE FROM sessions WHERE token_hash=?", (session["token_hash"],))
        response.delete_cookie(COOKIE, path="/")
        return {"ok": True}

    def where_clause(scope, label="", query="", start="", end=""):
        if scope not in {"all", "pinned", "archive", "trash"}:
            raise HTTPException(422, "Unknown note scope")
        clauses = ["deleted=1"] if scope == "trash" else ["deleted=0", "archived=?"]
        values = [] if scope == "trash" else [int(scope == "archive")]
        if scope == "pinned":
            clauses.append("pinned=1")
        if label:
            clauses.append("json_extract(document,'$.label')=?")
            values.append(label)
        if query:
            clauses.append("(instr(lower(json_extract(document,'$.title') || char(10) || json_extract(document,'$.body')), lower(?)) > 0 OR EXISTS(SELECT 1 FROM json_each(json_extract(notes.document,'$.items')) AS item WHERE instr(lower(json_extract(item.value,'$.text')), lower(?)) > 0))")
            values.extend([query, query])
        for value in (start, end):
            if value:
                try:
                    datetime.strptime(value, "%Y-%m-%d")
                except ValueError:
                    raise HTTPException(422, "Invalid calendar date")
        if start:
            clauses.append("local_date>=?")
            values.append(start)
        if end:
            clauses.append("local_date<=?")
            values.append(end)
        return " AND ".join(clauses), values

    @app.get("/api/notes")
    def list_notes(scope: str = "all", label: str = "", q: str = "", start: str = "", end: str = "", offset: int = 0, limit: int = 100, session=Depends(authenticated)):
        if not 1 <= limit <= 200 or offset < 0 or offset > 1_000_000 or len(q) > 500 or len(label) > 80:
            raise HTTPException(422, "Invalid note query")
        where, values = where_clause(scope, label, q.strip(), start, end)
        with db() as con:
            count = con.execute("SELECT count(*) FROM notes WHERE " + where, values).fetchone()[0]
            active_count = con.execute("SELECT count(*) FROM notes WHERE deleted=0 AND archived=0").fetchone()[0]
            rows = con.execute("SELECT * FROM notes WHERE " + where + " ORDER BY local_date DESC,created_at DESC,id LIMIT ? OFFSET ?", [*values, limit, offset]).fetchall()
        return {"notes": [note_json(row) for row in rows], "total": count, "active_count": active_count, "has_more": offset + len(rows) < count}

    @app.get("/api/calendar")
    def calendar(month: str, scope: str = "all", label: str = "", session=Depends(authenticated)):
        if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", month) or len(label) > 80:
            raise HTTPException(422, "Invalid calendar query")
        where, values = where_clause(scope, label)
        with db() as con:
            days = con.execute("SELECT DISTINCT local_date FROM notes WHERE " + where + " AND substr(local_date,1,7)=?", [*values, month]).fetchall()
        return {"dates": [row[0] for row in days]}

    @app.put("/api/notes/{note_id}")
    def save_note(note_id: str, body: NoteBody, session=Depends(authenticated)):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,80}", note_id):
            raise HTTPException(422, "Invalid note ID")
        if not body.title.strip() and not body.body.strip() and not any(item.text.strip() for item in body.items) and not body.deleted:
            raise HTTPException(422, "Add a title, text, or checklist item")
        if len({item.id for item in body.items}) != len(body.items):
            raise HTTPException(422, "Checklist item IDs must be unique")
        document = body.model_dump(exclude={"mutation_id", "base_revision"})
        with db() as con:
            con.execute("BEGIN IMMEDIATE")
            current = con.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            previous = con.execute("SELECT * FROM mutations WHERE id=?", (body.mutation_id,)).fetchone()
            if previous:
                if previous["note_id"] != note_id or previous["operation"] != "save":
                    raise HTTPException(409, "This save request was already used")
                if not current:
                    raise HTTPException(409, "This note was deleted after the original save")
                return note_json(current)
            if current and current["revision"] != body.base_revision:
                raise HTTPException(409, {"message": "Another edit was saved", "current": note_json(current)})
            if not current and (body.base_revision != 0 or con.execute("SELECT 1 FROM mutations WHERE note_id=? LIMIT 1", (note_id,)).fetchone()):
                raise HTTPException(409, "This note was deleted; save your draft as a separate note")
            now = utc_now()
            created_at = current["created_at"] if current else stamp(now)
            date = current["local_date"] if current else now.astimezone(TZ).date().isoformat()
            local_time = current["local_time"] if current else now.astimezone(TZ).strftime("%H:%M")
            revision = current["revision"] + 1 if current else 1
            con.execute("INSERT OR REPLACE INTO notes VALUES(?,?,?,?,?,?,?,?,?,?)", (note_id, json.dumps(document, ensure_ascii=False), revision, created_at, stamp(now), date, local_time, int(body.pinned), int(body.archived), int(body.deleted)))
            con.execute("INSERT INTO mutations VALUES(?,?,?,?)", (body.mutation_id, note_id, "save", int(time.time())))
            saved = con.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        return note_json(saved)

    @app.delete("/api/notes/{note_id}")
    def delete_note(note_id: str, body: DeleteBody, session=Depends(authenticated)):
        with db() as con:
            con.execute("BEGIN IMMEDIATE")
            previous = con.execute("SELECT * FROM mutations WHERE id=?", (body.mutation_id,)).fetchone()
            if previous and previous["note_id"] == note_id and previous["operation"] == "delete":
                return {"deleted": note_id}
            if previous:
                raise HTTPException(409, "This request was already used")
            row = con.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            if not row:
                raise HTTPException(404, "Note not found")
            if row["revision"] != body.base_revision:
                raise HTTPException(409, "The note changed. Refresh before deleting it")
            if not row["deleted"]:
                raise HTTPException(400, "Move the note to Trash before deleting permanently")
            con.execute("DELETE FROM notes WHERE id=?", (note_id,))
            con.execute("INSERT INTO mutations VALUES(?,?,?,?)", (body.mutation_id, note_id, "delete", int(time.time())))
        return {"deleted": note_id}

    def export_document():
        with db() as con:
            rows = con.execute("SELECT * FROM notes ORDER BY created_at,id").fetchall()
        return {"format": "daynote", "schema_version": 1, "exported_at": stamp(utc_now()), "timezone": "Asia/Kolkata", "notes": [note_json(row) for row in rows]}

    @app.get("/api/export/json")
    def export_json(session=Depends(authenticated)):
        return Response(json.dumps(export_document(), ensure_ascii=False, indent=2), media_type="application/json", headers={"Content-Disposition": 'attachment; filename="daynote-notes.json"'})

    @app.get("/api/export/markdown")
    def export_markdown(session=Depends(authenticated)):
        document = export_document()
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("metadata.json", json.dumps(document, ensure_ascii=False, indent=2))
            for note in document["notes"]:
                title = note["title"] or "Untitled note"
                content = f"# {title}\n\nCreated: {note['createdAt']}\nDate: {note['date']}\nLabel: {note['label']}\n\n{note['body']}\n"
                if note["items"]:
                    content += "\n" + "\n".join(f"- [{'x' if i['done'] else ' '}] {i['text']}" for i in note["items"]) + "\n"
                archive.writestr(f"notes/{note['date']}-{note['id']}.md", content)
        return Response(buffer.getvalue(), media_type="application/zip", headers={"Content-Disposition": 'attachment; filename="daynote-markdown.zip"'})

    @app.get("/")
    def index():
        return FileResponse(STATIC / "index.html")

    @app.get("/favicon.ico")
    def favicon():
        return Response(status_code=204)

    app.mount("/static", StaticFiles(directory=STATIC), name="static")
    return app


def backup_database(data_dir=None):
    """Consistent daily/weekly snapshots; caller runs under the app's Unix user."""
    data = Path(data_dir or os.getenv("DAYNOTE_DATA", "/data"))
    backups = data / "backups"
    backups.mkdir(mode=0o700, exist_ok=True)
    now = utc_now().astimezone(TZ)
    destination = backups / f"daily-{now:%Y-%m-%d}.sqlite3"
    temporary = destination.with_suffix(".tmp")
    with sqlite3.connect(data / "daynote.sqlite3") as source, sqlite3.connect(temporary) as target:
        source.backup(target)
        if target.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("Backup integrity check failed")
    os.chmod(temporary, 0o600)
    temporary.replace(destination)
    if now.weekday() == 0:
        weekly = backups / f"weekly-{now:%Y-%m-%d}.sqlite3"
        if not weekly.exists():
            weekly.write_bytes(destination.read_bytes())
            os.chmod(weekly, 0o600)
    for prefix, keep in (("daily", 7), ("weekly", 4)):
        for old in sorted(backups.glob(prefix + "-*.sqlite3"), reverse=True)[keep:]:
            old.unlink()
    return destination


if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["backup"]:
        print(backup_database())
    else:
        print("Run with uvicorn server:create_app --factory, or python server.py backup")

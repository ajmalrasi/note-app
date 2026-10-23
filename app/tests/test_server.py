import importlib.util
import io
import json
from pathlib import Path
import secrets
import sqlite3
from datetime import datetime, timezone
import zipfile

import pytest
from fastapi.testclient import TestClient

spec = importlib.util.spec_from_file_location("daynote_server", Path(__file__).parents[1] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
PASSWORD = "only-for-disposable-tests-123"
REQUEST = {"X-Daynote-Request": "1", "Origin": "http://testserver"}


@pytest.fixture
def workspace(tmp_path):
    app = server.create_app(tmp_path / "data", ["testserver"])
    client = TestClient(app, headers=REQUEST)
    token = (app.state.data / "setup-token").read_text()
    result = client.post("/api/setup", json={"token": token, "password": PASSWORD, "display_name": "Test owner"})
    assert result.status_code == 200, result.text
    client.headers["X-CSRF-Token"] = result.json()["csrf"]
    yield app, client
    client.close()


def note_body(**changes):
    return {"mutation_id": secrets.token_hex(16), "base_revision": 0, "title": "A thought", "body": "Remember this", **changes}


def save(client, note_id="test-note", **changes):
    response = client.put("/api/notes/" + note_id, json=note_body(**changes))
    assert response.status_code == 200, response.text
    return response.json()


def test_fresh_install_requires_secret_setup_and_one_owner(tmp_path):
    app = server.create_app(tmp_path / "fresh", ["testserver"])
    client = TestClient(app, headers=REQUEST)
    assert client.get("/api/session").json() == {"authenticated": False, "setup_required": True}
    assert client.get("/api/notes").status_code == 401
    bad = client.post("/api/setup", json={"token": "x" * 40, "password": PASSWORD})
    assert bad.status_code == 403
    token = (app.state.data / "setup-token").read_text()
    response = client.post("/api/setup", json={"token": token, "password": PASSWORD})
    assert response.status_code == 200
    assert not (app.state.data / "setup-token").exists()
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]
    assert client.post("/api/setup", json={"token": token, "password": PASSWORD}).status_code == 403
    assert client.get("/api/notes").json()["total"] == 0


def test_login_logout_session_revocation_and_failed_attempts(workspace):
    app, client = workspace
    assert client.get("/api/session").json()["authenticated"]
    old_cookie = client.cookies.get(server.COOKIE)
    assert client.post("/api/logout", json={}).status_code == 200
    assert client.get("/api/notes").status_code == 401
    client.cookies.set(server.COOKIE, old_cookie)
    assert client.get("/api/notes").status_code == 401
    client.cookies.clear()
    assert client.post("/api/login", json={"password": "wrong"}).status_code == 401
    response = client.post("/api/login", json={"password": PASSWORD})
    assert response.status_code == 200
    client.headers["X-CSRF-Token"] = response.json()["csrf"]
    assert client.get("/api/export/json").status_code == 200


def test_rate_limit_persists_across_app_restart(workspace):
    app, client = workspace
    client.post("/api/logout", json={})
    for _ in range(10):
        assert client.post("/api/login", json={"password": "bad"}).status_code == 401
    new_app = server.create_app(app.state.data, ["testserver"])
    other = TestClient(new_app, headers=REQUEST)
    assert other.post("/api/login", json={"password": PASSWORD}).status_code == 429


def test_host_origin_csrf_and_custom_header_protection(workspace):
    _, client = workspace
    assert client.get("/healthz", headers={"Host": "attacker.example"}).status_code == 400
    assert client.put("/api/notes/test", json=note_body(), headers={"Origin": "http://attacker.example"}).status_code == 403
    assert client.put("/api/notes/test", json=note_body(), headers={"X-CSRF-Token": "wrong"}).status_code == 403
    assert client.put("/api/notes/test", json=note_body(), headers={"X-Daynote-Request": ""}).status_code == 403
    assert client.put("/api/notes/test", json=note_body(), headers={"Sec-Fetch-Site": "cross-site"}).status_code == 403


def test_duplicate_save_retries_and_conflict_preserve_data(workspace):
    _, client = workspace
    body = note_body()
    first = client.put("/api/notes/test", json=body).json()
    assert first["revision"] == 1
    assert client.put("/api/notes/test", json=body).json()["revision"] == 1
    second = save(client, "test", base_revision=1, title="Updated")
    assert second["revision"] == 2
    assert client.put("/api/notes/test", json=body).json()["revision"] == 2
    stale = client.put("/api/notes/test", json=note_body(base_revision=1, title="Stale text"))
    assert stale.status_code == 409
    assert stale.json()["detail"]["current"]["title"] == "Updated"
    assert client.get("/api/notes").json()["total"] == 1


@pytest.mark.parametrize("created,expected", [
    ("2026-10-22T18:35:00+00:00", "2026-10-23"),
    ("2028-02-28T18:35:00+00:00", "2028-02-29"),
    ("2026-12-31T18:35:00+00:00", "2027-01-01"),
])
def test_local_date_boundaries_are_immutable(workspace, monkeypatch, created, expected):
    _, client = workspace
    monkeypatch.setattr(server, "utc_now", lambda: datetime.fromisoformat(created))
    first = save(client)
    assert first["date"] == expected
    assert first["time"] == "00:05"
    monkeypatch.setattr(server, "utc_now", lambda: datetime(2029, 4, 2, tzinfo=timezone.utc))
    edited = save(client, base_revision=1, title="Edited later")
    assert edited["date"] == first["date"]
    assert edited["createdAt"] == first["createdAt"]
    assert edited["updatedAt"] != first["updatedAt"]


def test_checklists_search_archive_trash_and_restore(workspace):
    _, client = workspace
    item = {"id": "first-item", "text": "Buy lemons", "done": True}
    first = save(client, kind="checklist", items=[item], label="Personal", pinned=True)
    assert client.get("/api/notes?q=lemons").json()["total"] == 1
    assert client.get("/api/notes?scope=pinned&label=Personal").json()["total"] == 1
    assert client.get("/api/notes?label=Work").json()["total"] == 0
    assert client.get("/api/calendar", params={"month": first["date"][:7]}).json()["dates"] == [first["date"]]
    archived = save(client, base_revision=1, archived=True, items=[item])
    assert client.get("/api/notes").json()["total"] == 0
    assert client.get("/api/notes?scope=archive").json()["total"] == 1
    trashed = save(client, base_revision=archived["revision"], deleted=True, items=[item])
    assert client.get("/api/notes?scope=trash").json()["total"] == 1
    restored = save(client, base_revision=trashed["revision"], deleted=False, items=[item])
    assert restored["items"][0] == item
    assert client.get("/api/notes").json()["total"] == 1


def test_permanent_delete_requires_trash_and_is_idempotent(workspace):
    _, client = workspace
    save(client)
    deletion = {"mutation_id": secrets.token_hex(16), "base_revision": 1}
    assert client.request("DELETE", "/api/notes/test-note", json=deletion).status_code == 400
    save(client, base_revision=1, deleted=True)
    assert client.request("DELETE", "/api/notes/test-note", json=deletion).status_code == 409
    deletion["base_revision"] = 2
    assert client.request("DELETE", "/api/notes/test-note", json=deletion).status_code == 200
    assert client.request("DELETE", "/api/notes/test-note", json=deletion).status_code == 200
    assert client.get("/api/notes?scope=trash").json()["total"] == 0
    assert client.put("/api/notes/test-note", json=note_body()).status_code == 409


def test_validation_and_plain_text_content(workspace):
    _, client = workspace
    assert client.put("/api/notes/test", json=note_body(title="", body="")).status_code == 422
    assert client.put("/api/notes/test", json=note_body(color="invalid")).status_code == 422
    assert client.put("/api/notes/test", json=note_body(date="2020-01-01")).status_code == 422
    assert client.put("/api/notes/test", json=note_body(items=[{"id": "a", "text": "one"}, {"id": "a", "text": "two"}])).status_code == 422
    note = save(client, title="<script>alert('x')</script>", body="你好 café")
    assert "<script>" in note["title"]
    assert client.get("/api/notes?q=你好").json()["total"] == 1
    assert client.get("/api/notes?start=not-a-date").status_code == 422


def test_exports_and_backup_can_restore_notes(workspace, tmp_path):
    app, client = workspace
    note = save(client, items=[{"id": "one", "text": "An item", "done": True}])
    exported = client.get("/api/export/json").json()
    assert exported["notes"][0] == note
    markdown = zipfile.ZipFile(io.BytesIO(client.get("/api/export/markdown").content))
    assert "metadata.json" in markdown.namelist()
    text = markdown.read("notes/" + note["date"] + "-test-note.md").decode()
    assert "- [x] An item" in text
    destination = server.backup_database(app.state.data)
    restore_dir = tmp_path / "restore"
    restore_dir.mkdir()
    (restore_dir / "daynote.sqlite3").write_bytes(destination.read_bytes())
    restored_app = server.create_app(restore_dir, ["testserver"])
    other = TestClient(restored_app, headers=REQUEST)
    auth = other.post("/api/login", json={"password": PASSWORD})
    assert auth.status_code == 200
    assert other.get("/api/notes").json()["notes"][0] == note
    with sqlite3.connect(destination) as con:
        assert con.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_pagination_counts_and_date_filter(workspace):
    app, client = workspace
    example = save(client)
    with app.state.db() as con:
        base = dict(con.execute("SELECT * FROM notes LIMIT 1").fetchone())
        for index in range(205):
            row = {**base, "id": f"note-{index:04d}"}
            con.execute("INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?)", tuple(row.values()))
    first = client.get("/api/notes?limit=200").json()
    second = client.get("/api/notes?limit=200&offset=200").json()
    assert first["total"] == 206 and first["has_more"]
    assert len(first["notes"]) == 200 and len(second["notes"]) == 6
    assert not {n["id"] for n in first["notes"]} & {n["id"] for n in second["notes"]}
    assert client.get("/api/notes?start=2000-01-01&end=2000-01-02").json()["total"] == 0
    assert client.get("/api/notes", params={"start": example["date"], "end": example["date"]}).json()["total"] == 206


def test_session_expiry_and_unauthenticated_exports(workspace):
    app, client = workspace
    with app.state.db() as con:
        con.execute("UPDATE sessions SET expires=0")
    for path in ("/api/notes", "/api/calendar?month=2026-10", "/api/export/json", "/api/export/markdown"):
        assert client.get(path).status_code == 401


def test_static_assets_and_security_headers(workspace):
    _, client = workspace
    for path in ("/", "/static/app.js", "/static/styles.css", "/healthz"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        assert response.headers["cache-control"] == "no-store"


def test_personal_mode_opens_without_password_but_keeps_request_protection(tmp_path):
    app = server.create_app(tmp_path / "personal", ["testserver"], personal_mode=True)
    client = TestClient(app, headers=REQUEST)
    session = client.get("/api/session").json()
    assert session["authenticated"] and session["personal_mode"]
    assert not (app.state.data / "setup-token").exists()
    assert not client.cookies
    note = save(client)
    assert client.get("/api/notes").json()["notes"][0] == note
    assert client.get("/api/export/json").status_code == 200
    assert client.put("/api/notes/other", json=note_body(), headers={"Origin": "http://attacker.example"}).status_code == 403
    assert client.put("/api/notes/other", json=note_body(), headers={"X-Daynote-Request": ""}).status_code == 403
    assert client.post("/api/login", json={"password": PASSWORD}).status_code == 404
    assert client.post("/api/setup", json={"token": "x" * 40, "password": PASSWORD}).status_code == 404


def test_switching_to_personal_mode_preserves_existing_notes(workspace):
    app, client = workspace
    note = save(client, title="Keep this note")
    personal = server.create_app(app.state.data, ["testserver"], personal_mode=True)
    anonymous = TestClient(personal, headers=REQUEST)
    assert anonymous.get("/api/notes").json()["notes"][0] == note
    assert anonymous.get("/api/session").json()["display_name"] == "Test owner"

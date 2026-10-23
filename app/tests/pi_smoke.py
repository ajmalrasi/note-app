"""Run only against the disposable daynote-staging container on the Pi."""
import http.cookiejar
import json
from pathlib import Path
import secrets
import sqlite3
import statistics
import subprocess
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:8241"
PASSWORD = secrets.token_urlsafe(24)
container = "daynote-staging"
assert subprocess.check_output(["docker", "inspect", "--format", "{{.Name}}", container], text=True).strip() == "/daynote-staging"
cookie = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookie))
csrf = ""


def request(path, method="GET", body=None, expected=200):
    headers = {"Content-Type": "application/json", "X-Daynote-Request": "1", "Origin": BASE}
    if csrf:
        headers["X-CSRF-Token"] = csrf
    req = urllib.request.Request(BASE + path, data=json.dumps(body).encode() if body is not None else None, method=method, headers=headers)
    try:
        with opener.open(req, timeout=10) as response:
            status, value = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, value = error.code, json.load(error)
    assert status == expected, (path, status, value)
    return value


for _ in range(30):
    try:
        request("/healthz")
        break
    except (OSError, AssertionError):
        time.sleep(.5)
else:
    raise RuntimeError("Staging did not become ready")
request("/api/notes", expected=401)
token = subprocess.check_output(["docker", "exec", container, "cat", "/data/setup-token"], text=True).strip()
csrf = request("/api/setup", "POST", {"token": token, "password": PASSWORD, "display_name": "Disposable Pi test"})["csrf"]
body = {"mutation_id": secrets.token_hex(16), "base_revision": 0, "title": "Restart persistence check", "body": "Disposable test content", "color": "sage"}
note = request("/api/notes/pi-smoke-note", "PUT", body)
assert note["revision"] == 1
assert request("/api/notes/pi-smoke-note", "PUT", body)["revision"] == 1
body = {**body, "base_revision": 1, "mutation_id": secrets.token_hex(16), "title": "Confirmed on the Pi"}
updated = request("/api/notes/pi-smoke-note", "PUT", body)
request("/api/notes/pi-smoke-note", "PUT", {**body, "mutation_id": secrets.token_hex(16)}, expected=409)
assert updated["date"] == note["date"] and updated["revision"] == 2
subprocess.run(["docker", "restart", container], check=True, stdout=subprocess.DEVNULL)
for _ in range(30):
    try:
        request("/healthz")
        break
    except OSError:
        time.sleep(.5)
assert request("/api/notes")["notes"][0]["title"] == "Confirmed on the Pi"
assert request("/api/export/json")["notes"][0]["createdAt"] == note["createdAt"]
backup = subprocess.check_output(["docker", "exec", container, "python", "/app/server.py", "backup"], text=True).strip()
check_backup = "import sqlite3; c=sqlite3.connect(" + repr(backup) + "); assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'; assert c.execute('SELECT count(*) FROM notes').fetchone()[0]==1; print('Consistent backup verified')"
subprocess.run(["docker", "exec", container, "python", "-c", check_backup], check=True)

# Load testing data exists only in staging, never in the real workspace.
populate = """
import sqlite3,json,datetime
c=sqlite3.connect('/data/daynote.sqlite3')
base=dict(zip([r[0] for r in c.execute('SELECT * FROM notes LIMIT 0').description], c.execute('SELECT * FROM notes LIMIT 1').fetchone()))
rows=[]
for i in range(10000):
 row=dict(base);row['id']=f'benchmark-{i:05d}'
 row['document']=json.dumps({'title':f'Sample note {i}','body':'A searchable thought about the garden and a checklist.','color':'plain','label':'Ideas','kind':'text','items':[],'pinned':False,'archived':False,'deleted':False})
 row['local_date']=(datetime.date.today()-datetime.timedelta(days=i%90)).isoformat()
 rows.append(tuple(row.values()))
c.executemany('INSERT INTO notes VALUES(?,?,?,?,?,?,?,?,?,?)',rows);c.commit()
"""
subprocess.run(["docker", "exec", container, "python", "-c", populate], check=True)
results = {}
for name, path in (("first_page", "/api/notes?limit=200"), ("search", "/api/notes?q=garden&limit=200")):
    values = []
    for _ in range(10):
        start = time.perf_counter()
        result = request(path)
        values.append((time.perf_counter() - start) * 1000)
    assert result["total"] >= 10000
    results[name + "_median_ms"] = round(statistics.median(values), 1)
request("/api/logout", "POST", {})
request("/api/notes", expected=401)
print(json.dumps({"checks": "passed", "restart_persistence": True, "retry_idempotency": True, "conflict_detection": True, "backup_integrity": True, "sample_note_count": 10001, **results}))

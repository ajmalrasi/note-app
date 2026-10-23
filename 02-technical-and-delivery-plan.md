# Technical and delivery plan

Prepared: 22 October 2026 · Proposed architecture, not an implementation.

## 1. Recommended shape

Use a responsive web app with one central database on the Pi. Each browser reads and writes the same service, so the MacBook and phone see the same saved notes when they can reach the Pi. Normal operation should not depend on Google services or public internet access.

```text
MacBook / phone browser
        |
        | private network, HTTPS for regular use
        v
Raspberry Pi: HTTPS entry point
        |
        v
One application service
  - compiled frontend files
  - authenticated notes API
        |
        v
Local SQLite database in persistent storage
        |
        v
Consistent backups -> separate device or MacBook
```

This deliberately keeps the server small. There is no separate database server, queue, or cloud account requirement for the first release.

## 2. Candidate implementation

| Layer | Proposed choice | Reason |
| --- | --- | --- |
| Interface | React + TypeScript, built with Vite | Interactive cards, editor, and filters; compiled static assets can be served by the API process |
| Server | Python + FastAPI + an ASGI server | Existing Python familiarity on the Pi; straightforward typed API and validation |
| Storage | SQLite on the Pi's local filesystem | Appropriate scale and low operational overhead for one owner |
| Packaging | One app container, persistent data volume; optional separate HTTPS proxy | Docker executable already present; isolate dependencies from existing apps |
| Release work | Build frontend on the MacBook; produce/test a Linux ARM64 release | Avoid needing a frontend development server on the Pi |

These are choices to confirm during implementation, not claims that the packages are installed. Check supported Python versions, Docker daemon access, Compose availability, ARM64 image support, and locked dependency versions before selecting the release environment. The existing OS need not be reinstalled for this project.

React's documentation generally recommends frameworks and also documents building from scratch for constraints. A small static client with a separate Python API is a project-specific tradeoff here. [React documentation](https://react.dev/learn/creating-a-react-app).

FastAPI requires an ASGI server in deployment. A development reload process should not be used as the daily service. [FastAPI deployment](https://fastapi.tiangolo.com/deployment/manually/).

SQLite allows many readers but a single simultaneous writer; short transactions are a reasonable fit for this proposed workload. Do not put the database on a network share accessed directly by browsers or multiple machines. [SQLite suitability](https://www.sqlite.org/whentouse.html).

## 3. Data model to preserve

| Record | Key fields |
| --- | --- |
| Note | Stable UUID, owner ID, optional title, body, text/checklist kind, color, pinned, archived_at, deleted_at, created_at_utc, updated_at_utc, created_local_date, creation_timezone, revision |
| Checklist item | Stable UUID, note ID, text, checked state, position |
| Label | Stable UUID, owner ID, name |
| Note-label relationship | Note ID and label ID, unique pair |
| Owner/settings/session | Password hash, timezone, week-start preference, expiring/revocable server-side sessions |
| Save request identity | Owner-scoped request ID with enough retained information to make creation retries idempotent |

Assign timestamps on the server at first successful creation. Compute and persist the creation-day value using the configured timezone in the same transaction. Ordinary edits cannot alter it. A later backdating feature should use a separate explicit note date and preserve the audit timestamps.

Use revision numbers for every note mutation, including checklist, archive, trash, and pin changes. Keep checklist edits and their parent note revision in one transaction. Add schema migrations so future changes are repeatable and recoverable.

Date indexes should support owner, active/archive/trash scope, creation date, timestamp, and stable ID. Begin with parameterized search queries over titles, bodies, and checklist text; evaluate SQLite full-text search if measured performance or search behavior justifies it.

Return pages in a stable order and merge a date group across page boundaries. Avoid rendering or returning the entire note collection on every request. Grouping keys use calendar dates and week-start dates, not week numbers alone. Filters and grouping must use the same date rules.

## 4. Saving and multiple devices

Use a short autosave delay, approximately 500–800 ms after typing stops, while keeping typing immediate. Serialize edits per note; a delayed request must not overwrite a newer one. First-save retries must reuse the same request identity so network retries do not create duplicate notes.

Show “Saved” only after the server confirms the commit. Preserve a recoverable per-note browser draft when possible and clearly mark unsaved edits. Browser storage is best-effort and may be cleared; it is neither the main database nor a backup. Remove owner-specific local drafts on logout and never include them in service-worker public caches.

If a second browser edits an outdated revision, reject the stale write and offer a conflict flow that retains both texts. Never silently overwrite either user's work, even when both sessions belong to the same owner. Refresh saved data when the app regains focus and provide a manual refresh path; live collaboration is outside the first release.

The first release requires connectivity to the Pi for confirmed saves. Recovering an open draft after a brief disconnection is a smaller promise than being able to launch and edit the whole app offline.

Full offline support would need a service worker, cached application, durable local queue, tombstones, retry/conflict rules, and explicit sync status. Service workers require a secure context; a Pi's ordinary HTTP LAN address does not receive the localhost development exception. Plan trusted HTTPS before promising offline installation. [MDN service-worker requirements](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## 5. Deployment and recovery

The Pi already has services on ports 80, 8000, 8080, and several others. Give this project its own service name, data volume, and unused entry port; verify availability again at deployment. Port 8443 is a candidate for a separate HTTPS entry point, not a reservation. Do not replace the existing port-80 service as part of a routine install.

For regular private use, choose either a local HTTPS proxy with a certificate trusted by the intended devices, or a suitable private VPN HTTPS setup if access away from home is wanted. Certificate trust and hostname setup are real deployment tasks. A VPN still adds an external dependency if a hosted control service is chosen. Do not assume a raw IP will remain stable; use a router reservation or agreed local hostname.

Use a dedicated service account/container user, owner login, strong password hashing, expiring HttpOnly session cookies, secure cookies over HTTPS, request-origin/CSRF protection, login rate limiting, input limits, and plain-text rendering. Treat pasted note content as untrusted. Bind the internal app behind its entry point and scope access to the chosen private network. The OS SSH credential is separate from the future app credential.

Put the database outside the container's disposable filesystem. Docker volumes persist across container replacement, but volume removal still deletes data. Use named, documented persistent storage and never remove it during a release. [Docker volumes](https://docs.docker.com/engine/storage/volumes/).

Proposed backup policy: nightly consistent SQLite backup, 7 daily and 4 weekly copies, with at least one copy on a different device. Use SQLite's backup API or an equivalent consistent snapshot, rather than copying only a live database file. Include configuration and, if later added, attachment files. A backup on the same SD card is only a convenience copy. [SQLite online backup](https://www.sqlite.org/backup.html).

Test restoring onto a separate directory before daily use. A full JSON export should retain IDs, dates, checklist state, labels, color, archive/trash status, and schema version. Markdown is for readability. Neither replaces a verified full backup.

Before upgrades, take a backup, record the release version, and validate migrations. Retain the previous application release; schema changes may require restoring a matching pre-upgrade database for rollback. Enable restart-on-boot and a health endpoint that checks database access without revealing note content. Monitor free disk space and backup failures. Power loss and SD-card wear remain operational considerations; an SSD or UPS is an optional later improvement, not a prerequisite established by this study.

## 6. Work phases

| Phase | Deliverable | Completion condition |
| --- | --- | --- |
| Analysis — current | Product brief, technical plan, device facts, sources | Files saved locally; assumptions and open decisions explicit |
| Design | Desktop/mobile mockups and interaction examples | Capture, date navigation, editing, and failure states are understandable |
| Local prototype | Working cards, editor, search, date grouping with sample data | Behavior can be reviewed on the MacBook |
| Durable app | Database, login, revision checks, export, migrations | Data persists and stale edits cannot silently overwrite |
| Pi pilot | ARM64 release, isolated service, HTTPS, backups, restore guide | Works on MacBook and phone; survives a scheduled restart |
| Daily-use trial | Realistic note collection and recovery exercises | Core acceptance checks pass; unresolved issues documented |

No reliable calendar estimate is established yet. Visual fidelity, full offline editing, importing old notes, and sharing are the largest potential scope changes. A simple single-owner version should be established before adding them.

## 7. Acceptance checks for the future implementation

- Create/edit plain text and checklists; reload and reopen on another browser without losing confirmed saves.
- Verify midnight, month/year boundaries, leap day, week start, and original-date retention after edits.
- Combine search, labels, and date filters; verify result counts and pagination without duplicated or missing notes.
- Simulate a timeout after a successful creation; retry without producing a second note.
- Edit the same note in two sessions; preserve both texts through the conflict flow.
- Interrupt connectivity during editing; clearly distinguish draft from confirmed save and recover the draft where browser storage permits.
- Verify archive/trash/restore, pinning within date groups, and explicit permanent deletion.
- Deny unauthenticated access to notes, search, and exports; test session expiry and pasted script-like text.
- Restore a real backup to an isolated instance and compare representative notes and their metadata.
- Measure startup, search, and scrolling on the actual Pi with 10,000 sample text notes. Proposed targets: first usable page within 2 seconds on the LAN, API save/search typically under 500 ms, and responsive typing. These are targets, not measured results.
- Check desktop keyboard navigation and a phone-width layout, including visible touch actions and long content.

Only the hardware/OS inspection has been performed so far. These application checks belong to later phases.

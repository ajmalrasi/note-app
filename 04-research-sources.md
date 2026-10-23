# Research sources

Consulted 22 October 2026. Official documentation was used for technical/product facts. Proposed app behavior and architecture are recommendations derived from the brief, rather than promises made by these sources.

| Source | What it informs |
| --- | --- |
| [Google Keep: organize notes](https://support.google.com/keep/answer/6191044?co=GENIE.Platform%3DDesktop&hl=en) | Labels, colors, and pinning as reference behaviors |
| [Google Keep: getting started](https://support.google.com/keep/answer/2888240?hl=en) | Core note and list workflows |
| [Google Keep product page](https://workspace.google.com/products/keep/) | Product/interface reference for the later design phase |
| [Memos documentation](https://usememos.com/docs) | Chronological notes and date/calendar retrieval as an alternative approach |
| [Memos Docker deployment](https://usememos.com/docs/deploy/docker) | SQLite persistence and documented ARM platform support |
| [Joplin synchronization](https://joplinapp.org/help/apps/sync/) | Alternative client-and-sync model |
| [Raspberry Pi remote access](https://www.raspberrypi.com/documentation/computers/remote-access.html) | Official support for network access and web serving on the Pi |
| [Raspberry Pi hardware documentation](https://www.raspberrypi.com/documentation/computers/raspberry-pi.html) | Hardware, power, and storage considerations |
| [React: creating an app](https://react.dev/learn/creating-a-react-app) | Framework versus custom client setup tradeoff |
| [FastAPI: running a server](https://fastapi.tiangolo.com/deployment/manually/) | ASGI deployment model |
| [SQLite: appropriate uses](https://www.sqlite.org/whentouse.html) | Embedded database fit and concurrency limits |
| [SQLite backup API](https://www.sqlite.org/backup.html) | Consistent live backup rather than unsafe file copying |
| [Python sqlite3 documentation](https://docs.python.org/3.11/library/sqlite3.html) | Python's database interface and backup capability |
| [Docker volumes](https://docs.docker.com/engine/storage/volumes/) | Persistent data outside a container's writable layer |
| [Docker Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/) | Readiness checks for any future multi-service deployment |
| [MDN: using service workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) | HTTPS/secure-context requirement and offline architecture |

## Evidence limits

The Pi facts are direct observations summarized in the inspection file. Alternative products were studied through documentation, not installed or benchmarked. A signed-in Google Keep session was not inspected. No finished visual design, application performance measurement, security audit, or restore test has been carried out.

Dependency versions and alternative-product deployment instructions may change. Verify and pin them when implementation begins; do not treat the URLs or sample instructions as a ready-to-run deployment plan.

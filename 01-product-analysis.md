# Product analysis

Prepared: 22 October 2026 · Stage: analysis · Recommendations below are provisional.

## 1. What we are making

A personal notes app that feels familiar to a Google Keep user and answers a question quickly: “What did I write on that day, that week, or that month?” Notes live on your Raspberry Pi. You use the app through a browser on the MacBook or phone; the Pi does not need an attached screen.

Your explicit requirements are Raspberry Pi hosting, a Keep-like design, date-based organization, and analysis before design or implementation. The first release is assumed to serve one person on the home network. Providing the Pi connection enabled a hardware inspection; remote access requirements are still undecided.

The Pi appears capable of this workload based on its observed resources. Actual speed and reliability will need measurement with the application running.

## 2. What to take from Google Keep

Keep's official help documents labels, note colors, pinning, and quick note/list creation. These are useful reference behaviors. See [Google's organization guide](https://support.google.com/keep/answer/6191044?co=GENIE.Platform%3DDesktop&hl=en) and [Keep overview](https://support.google.com/keep/answer/2888240?hl=en).

The proposed interface direction is a quiet workspace with a search field, a compact “Take a note” composer, rounded cards, restrained color choices, and a collapsible sidebar. The main addition is visible date headings plus a Day / Week / Month grouping control. The eventual app should have its own name and assets.

This is a design brief, not a finished design. Exact spacing, colors, card layout, and interactions should be explored in the next phase.

## 3. Date behavior: the central decision

**Default recommendation: organize notes by the local date when they were first saved.** Display the creation date on the card; show both created and last-edited timestamps in note details.

| View | What appears | Example |
| --- | --- | --- |
| Day — default | Cards under individual date headings, newest date first | Today · Thu, 22 Oct 2026 |
| Week | Cards grouped by Monday–Sunday date range | 19–25 Oct 2026 |
| Month | Cards grouped under month and year | October 2026 |

These are three views over the same notes. Switching views never copies or moves data. A month view initially means grouped note cards, rather than a calendar full of events.

Recommended rules:

- A note created on 22 October stays under 22 October when edited on 25 October. Editing should not rewrite its history.
- Use Asia/Kolkata initially, matching the client context and the Pi's checked timezone. Save the creation-day value once so travel or later timezone changes do not silently regroup older notes.
- Start weeks on Monday. Label weeks with complete date ranges, including both months or years when necessary. Do not place a cross-month week in two buckets.
- Sort groups newest first. Within each group, show pinned notes first, then newest-created notes; use a stable ID to break timestamp ties.
- Keep pinned cards inside their date group so chronology remains understandable. A separate pinned-only filter can provide quick access.
- Use “Today” and “Yesterday” with an absolute date. Recalculate those labels when midnight passes or the app regains focus.
- Provide Today, This week, This month, and a date picker as shortcuts. A shortcut filters a time range; the grouping control changes presentation. Label them separately.
- Creating a note while viewing a past period still uses today's creation date. Explain that it was saved to Today and offer a jump there. Backdated journal entries can be added later if needed.
- Date filters, search, labels, and pin filters combine. Search covers active notes by default, with Archive and Trash available as explicit scopes.

Examples that the implementation must handle correctly:

| Situation | Expected result |
| --- | --- |
| First save at 00:05 India time on 23 October | Group under 23 October even though UTC is still 22 October |
| A draft begins before midnight and is first saved after midnight | Use the date of the first successful server save |
| Note edited a week later | Original date group retained |
| Week runs 26 October–1 November | One week group containing all seven dates |
| Week crosses New Year | One correctly labeled range with both years |
| Leap day | 29 February works as an ordinary date |
| A month has no notes | No empty group in the timeline; a selected empty range gets a clear empty state |

No reminders or due dates are required for this behavior. Those would be separate concepts if added later.

## 4. First usable release

| Capability | Required behavior |
| --- | --- |
| Quick capture | Optional title, plain text body, or a checklist; discard completely empty notes |
| Editing | Autosave with visible Saving / Saved / Could not save states |
| Timeline | Day, week, month grouping, date navigation, counts reflecting current filters |
| Retrieval | Search title and content, labels, date range, pinned filter |
| Familiar organization | Small color palette, pinning, archive, recoverable trash |
| Recovery | Restore trashed notes; permanent deletion only through a clear explicit action |
| Ownership | Single owner login; notes private by default |
| Portability | Download a full JSON export and readable Markdown notes; retain dates and IDs in export metadata |
| Usability | Responsive desktop/mobile layout, keyboard access, readable contrast, clear touch actions |
| Operations | Persistent storage, restart recovery, scheduled backups, a demonstrated restore |

Keep trash until manually emptied for the first release; avoid an unexpected automatic deletion policy. Archive hides notes from the main feed without changing their dates. Labels and colors supplement dates rather than replace them.

Defer rich text, image/file uploads, voice input, handwriting, reminders, Google Keep import, public sharing, multiple accounts, AI features, and full offline synchronization. Each adds implementation or data-handling work beyond the central need.

## 5. Build versus adapt

| Option | Fit | Tradeoff |
| --- | --- | --- |
| Custom application | Direct control over Keep-like cards and precise day/week/month behavior | We own autosave reliability, testing, security, updates, and recovery |
| Memos | Strong alternative for quick chronological notes; official docs describe date/calendar retrieval and self-hosting with SQLite and ARM images | Exact visual fit and requested grouping must be evaluated; a UI fork or integration introduces ongoing upgrade work |
| Joplin | Worth considering if installed clients and established synchronization become the priority | Its documented notebook/client synchronization model is a different starting point for this brief |

Sources: [Memos documentation](https://usememos.com/docs), [Memos deployment](https://usememos.com/docs/deploy/docker), [Joplin synchronization](https://joplinapp.org/help/apps/sync/).

**Recommendation:** plan a small custom app because the requested appearance and date behavior are central. Before committing substantial implementation time, compare a design prototype against Memos. If an existing app meets the need with minor compromises, adopting it would reduce maintenance. No alternative has been installed or hands-on tested during this analysis; no claim of feature absence is established by this comparison.

## 6. Brief for the design phase

Prepare a desktop layout and a mobile layout with the same sample notes. Include enough sample dates to demonstrate Today, older days, a cross-month week, and multiple months.

The desktop exploration should include sidebar navigation, search, the composer, date shortcuts, the grouping control, and cards under date headings. The mobile exploration should keep capture prominent, collapse navigation, and retain readable date context.

Explore a compact card grid within each date group and a chronological list alternative. Keep keyboard reading order aligned with the visible order; avoid a layout where notes from different dates interleave. Long notes need a readable preview and a full editor.

Show the editor, a checklist, search results, Archive, Trash, an empty date range, and save failure/conflict states. Include visible actions on touch devices rather than relying on hover. Color must not be the only indicator of note state.

The design should let us assess three things: speed of capture, ease of finding an old note, and whether date grouping remains clear at phone width. Final visual choices follow that review.

## 7. Open preferences

These can be resolved as the project progresses; the defaults above allow design work to begin.

1. Home network only, or access away from home? Default: home network.
2. One owner or multiple people? Default: one owner.
3. Should users deliberately assign a past date? Default: creation date only.
4. Are images, existing-note import, or offline editing essential immediately? Default: defer them.
5. Monday or Sunday week start? Default: Monday.

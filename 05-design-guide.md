# Daynote — design review

Prepared 22 October 2026. Daynote is a working name, open to change.

## Open the design

Open [the standalone interactive preview](design/daynote-preview.html) in a browser on this MacBook. It contains its own styling and interactions and needs no installation or internet access. The separate source files are also in `design/` for continued editing.

The preview uses fictional sample notes and a fixed demo date of 22 October 2026. Changes are saved to this browser's local storage where available. It is not connected to the Raspberry Pi and is not suitable as the final notes database. A different browser or file/HTTP address may have separate preview storage.

Click **Design preview** inside the app for a short guide, sample reset, and editor error/conflict scenarios. Do not enter irreplaceable notes into this prototype.

## Design direction

A familiar card-based workspace with more visible time context. The background is a cool off-white; white and softly colored cards carry the content. Yellow marks the brand and selected navigation, while the main capture action uses a dark neutral. Color is optional and does not determine a note's date or category.

The interface uses the MacBook's system font. Note titles are more prominent than toolbar labels; date headings divide the feed without adding large panels. Actions stay visible instead of appearing only on hover.

### Desktop

A 224 px sidebar contains All notes, Pinned, Archive, Trash, labels, and a compact date navigator. The 76 px header holds search and appearance controls. A quick composer sits above date controls and the card feed.

The normal desktop feed has three columns. Smaller screens use two, then one on phones. An optional list view offers a linear reading alternative. Every date group has its own layout, so cards from different dates never interleave.

### Phone

Navigation becomes a drawer. Search remains visible in the sticky header; the drawer and its date navigator open from the menu button. The note capture action stays near the page title. Cards use one column, with their actions visible. View controls wrap rather than causing horizontal scrolling. The hidden drawer is removed from keyboard navigation.

## What to try

1. Switch **Day / Week / Month**. This regroups the same notes without changing their creation dates. Week view includes a sample spanning September and October.
2. Use **All dates / Today / This week / This month** or click a calendar date. These filter the feed separately from its grouping.
3. Search for “garden,” or choose a label from the sidebar. An unmatched search shows an empty state with a way back.
4. Open a note. Edit its title, text, checklist, label, pin, or color. Its original creation date stays visible. Autosave status explicitly says “Saved in this preview.”
5. Archive a note, then find and unarchive it. Trash supports restore; permanent deletion has a confirmation.
6. Use the appearance toggle to compare light and dark modes, or switch the feed to list layout.
7. Under **Design preview**, choose a save failure or edit conflict, open a note, and press Done. Failure keeps the draft open. The conflict example offers a separate copy to preserve both versions.

The error and conflict scenarios are simulated design states. They do not validate a real network, authentication, or concurrent editing implementation.

## Saved screens

- [Desktop](design/desktop.png)
- [Phone](design/mobile.png)
- [Editor](design/editor.png)
- [Week grouping](design/week-view.png)
- [Save failure](design/save-error.png)
- [Editing conflict](design/edit-conflict.png)

## Verification performed

Reviewed the actual browser layout at desktop and phone widths, including 1440, 390, and 320 px. Checked for horizontal overflow at those widths. Verified day/week/month headings, the cross-month week, search and empty results, note creation/editing, persistence after reload, archive/unarchive, trash restore, mobile navigation, dark appearance, and the simulated save failure/conflict flows. JavaScript syntax checking passed.

This remains a design prototype. The next implementation phase must add real owner login, Pi storage, timestamps, version checks, backup/restore, and deployment. It also needs full keyboard/screen-reader, touch-device, long-content, and failure testing. No software was installed or changed on the Pi during this design phase.

## Files

`daynote-preview.html` is the portable review copy. `index.html`, `styles.css`, and `app.js` are the editable source. Regenerate the portable copy after changing those source files; it does not update itself. All six screenshots are from the implemented prototype.

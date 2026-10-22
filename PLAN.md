# Vizual Notes — Plan

*Formerly BT Notes (renamed 2026-10-22); folder and file names below keep the old name.*

A visual notes app that works like Storyflow. It opens to boards of notes, images, files, tables, charts and diagrams, linked by arrows and sorted into columns. Under the boards is a Markdown notes app with Bear's look and a few of Craft's features. Claude can build and read boards. It runs on Windows and Mac, keeps its notes in personal OneDrive, and uses an Apple Shortcut on the iPhone for quick capture. A web version will open the same notes in any browser, including on the phone.

## Decisions

| Area | Decision | Why |
|---|---|---|
| Storage | Plain files in `OneDrive/BT Notes/` on a personal OneDrive: notes as `.md`, boards as `.canvas`, images, videos and documents as themselves | Readable by any app, no lock-in. Decided 2026-10-21, moving from `iCloud Drive/BT Notes/` (phase 13); until the move, iCloud Drive is the home. |
| Sync (Mac, Windows) | The OneDrive app syncs the folder; the app only reads and writes local files. On the work laptop the personal account runs next to the work one. | The same notes on the Mac, the laptop and the iPhone. OneDrive is built into Windows and fast there; iCloud for Windows wasn't (its sign-in silently expired Oct 15–21). Its policy settings on the laptop don't block a personal account (checked 2026-10-21). |
| Sync (iPhone) | The OneDrive app, which also shows the folder in the Files app | Lets a Shortcut save captures straight into the folder (phase 14), and the Files app open notes, images and PDFs |
| Cost | Microsoft 365 Basic, about $1.99 a month for 100 GB; Microsoft 365 Personal, about $9.99 a month, if it outgrows that (1 TB and Office) | Cheapest of the options. Dropbox was considered: about $12 a month with no plan between 2 GB and 2 TB, and its file transfers were blocked on the corporate network (phase 0). Supabase and Backblaze B2 were considered for the web version: about the same cost, but BT Notes would have had to do its own syncing. |
| Work notes | A separate work folder, `OneDrive - Porsche Cars North America\BT Notes`, on the work laptop, chosen with **File → Change Notes Folder…** (set up 2026-10-21) | Work material belongs on work storage. The laptop can switch between it and the personal folder the same way; a Personal/Work switcher can come later. |
| Capture (iPhone) | An Apple Shortcut saves a note, with photos, straight into `Inbox/` (phase 14) | Works without the Mac. The Apple Notes import stays until the Shortcut has proven itself. |
| Web version (planned, phases 15–16) | The same Svelte app, hosted on Vercel, reading and writing the same OneDrive folder through Microsoft's API (Microsoft Graph), signed in with the personal Microsoft account. On the iPhone it's added to the Home Screen, with no App Store. | Notes from anywhere, including the phone, with no storage of its own and no syncing to build: OneDrive keeps the computers in step. Vercel's Hobby plan is free. |
| Layout | Boards first. The app opens to a **Home** board; boards hold notes, images, files and other boards | Visual learner. Works like Storyflow and Milanote. |
| Board format | JSON Canvas (`.canvas`), the open format Obsidian created, plus a column marker on groups | Obsidian can open the same boards, and Claude can write them directly |
| Tables, charts, diagrams | Markdown tables and Mermaid code inside text cards | Plain text that Claude writes well and Obsidian also draws |
| Claude access | Claude Code edits the files directly. A local MCP server gives the Claude desktop app the same access. | No hosted server, so boards stay on your devices and in your OneDrive |
| Desktop shell | Electron | Tauri needs Rust plus the C++ build tools, which aren't installed here and need admin rights |
| iPhone shell | Capacitor | Runs the same web UI as the desktop app |
| UI | Svelte + TypeScript + Vite | Small, fast bundles; one codebase for both shells |
| Editor | CodeMirror 6 with live preview | Markdown symbols fade and text formats as you type, like Bear |
| Search | MiniSearch, an in-memory index written in pure JS | Native SQLite would also need the C++ build tools, and pure JS runs unchanged on the iPhone |
| Encryption | None for now | Can be added later |
| Apple Notes import | One-way. A Mac helper moves notes from the Notes folder **Capture** into `BT Notes/Inbox/`, then deletes them from Apple Notes | Captures don't stay in Apple Notes |

## Folder layout

```
OneDrive/BT Notes/
  Boards/           one .canvas file per board
    Home.canvas     the board the app opens to
  Notes/            all notes, subpages included
    Project X.md
    Kickoff.md      a subpage of Project X: linked from it, same folder
  Daily/            one note per day: 2026-10-19.md
  Inbox/            new captures from the iPhone, waiting to be filed
  Attachments/      images, videos and documents used in notes and boards
  .Trash/           trashed notes and boards
```

Subpages are ordinary notes, tied to their parent by a link rather than a subfolder. A subfolder would have to be renamed, and every link into it rewritten, whenever the parent's title changed.

## Board format

A board is a JSON Canvas file: a list of cards (`nodes`) and the arrows between them (`edges`).

```json
{
  "nodes": [
    { "id": "img1", "type": "file", "file": "Attachments/kitchen.jpg", "x": 0, "y": 0, "width": 320, "height": 220 },
    { "id": "note1", "type": "file", "file": "Notes/Project X.md", "x": 380, "y": 0, "width": 280, "height": 180 },
    { "id": "board1", "type": "file", "file": "Boards/Ideas.canvas", "x": 380, "y": 240, "width": 280, "height": 80 },
    { "id": "col1", "type": "group", "label": "To read", "btColumn": true, "x": 720, "y": 0, "width": 300, "height": 420 },
    { "id": "chart1", "type": "text", "text": "```mermaid\npie title Progress\n  \"Done\": 7\n  \"Left\": 3\n```", "x": 740, "y": 40, "width": 260, "height": 200 },
    { "id": "link1", "type": "link", "url": "https://example.com", "x": 0, "y": 260, "width": 320, "height": 80 }
  ],
  "edges": [
    { "id": "e1", "fromNode": "img1", "fromSide": "right", "toNode": "note1", "toSide": "left", "toEnd": "arrow", "label": "inspired" }
  ]
}
```

- **Cards:** `text` (Markdown), `file` (a note, image, video, document or another board), `link` (a web address) and `group`.
- **Boards inside boards:** a `file` card pointing at another `.canvas` file. Double-click to open it.
- **Columns:** a group with `"btColumn": true`. The app stacks the cards inside it top to bottom. Obsidian shows it as a plain group.
- **Tables:** a Markdown table in a `text` card.
- **Charts and diagrams:** a `mermaid` code block in a `text` card: flowcharts, pie, bar and line charts, timelines.
- **Previews of images, videos and PDFs:** made on each device and kept outside the synced folder, like the search index.

## Note format

```markdown
---
created: 2026-10-19T09:14:00
pinned: false
---
# Project X

Notes go here. Tags are inline: #work #work/meetings

> [!note] Callout
> Shown as a highlighted block. Types: note, info, tip, important, warning, caution.

> [!toggle]- Toggle
> Hidden until expanded. `-` means closed, `+` means open.

- [ ] Send the draft 📅 2026-10-21
- [x] Book the room

See also [[Kickoff]], or with different text: [[Kickoff|the kickoff]].

[[Kickoff]]
```

- **Title:** the first `# heading`. The file name follows the title, except daily notes, which keep their date.
- **Tags:** nested with `/`, as in Bear. They come from the note text; no separate database.
- **Links:** `[[Name]]` finds the note by title, then by file name. When a note's title changes, links to it are updated.
- **Subpage cards:** a link alone on its line shows as a card.
- **Toggles:** callouts that collapse. This is Obsidian's syntax, so the files stay portable.
- **Search index, backlinks and task list:** built on each device from the files and never synced, so they can't cause conflicts.

## Features

**Storyflow-style boards**
- Opens to a Home board. Boards hold other boards.
- Mood boards: images, notes and text cards placed freely on a canvas.
- Columns that stack cards top to bottom.
- Arrows between cards, with optional labels.
- Documents on boards: notes, PDFs, Office files and videos.
- Tables, charts and diagrams.
- Claude can build, rearrange and read boards.

**Bear-style core**
- Sidebar (boards, tags), note list, editor.
- Live-preview editor.
- Nested tags.
- Pinned notes.
- Instant search.
- Light and dark themes.

**Craft-style additions**
- Daily notes with a calendar.
- `[[Links]]` between notes, with a backlinks panel.
- Subpages shown as cards inside the parent note.
- Callouts and toggles.
- Tasks with due dates, plus a Tasks view across all notes (Overdue, Today, Upcoming, No date).

## Phases

Each phase ends with a check that has to pass before the next one starts.

0. **Sync check.**
   - First test: Google Drive for desktop worked through the corporate proxy; Dropbox file transfer didn't.
   - 2026-10-20: switched to Dropbox. `BT Notes/sync-test.md`, written on the work laptop on the guest network, showed up on dropbox.com. ✅
   - *Check:* on the corporate network, edit `sync-test.md` on dropbox.com and the change reaches the laptop. ⏳
1. **Desktop core (Windows + Mac).** Built and tested on Windows, 2026-10-19.
   - Open the folder.
   - Note list, editor, tags, search.
   - Pick up changes made on other devices.
   - *Check:* edit on Windows and the change appears on the Mac. ⏳ Needs the Mac.
   - *Check:* search across 5,000 generated notes takes under 50 ms. ✅ Unit test.
2. **Craft features.** Built and tested on Windows, 2026-10-19: daily notes with a calendar, `[[links]]` with backlinks and autocomplete, subpage cards, callouts, toggles, tasks with due dates and a Tasks view.
3. **Move to iCloud Drive.** Superseded 2026-10-21 by the move to personal OneDrive (phase 13).
   - 2026-10-20: moved to Dropbox first (notes copied from `G:\My Drive\BT Notes`), then to iCloud Drive the same day, since Dropbox's free 2 GB is too small and iCloud+ is already paid for.
   - The app, the MCP server and the Apple Notes import open `iCloud Drive/BT Notes` by default (`src/shared/notesRoot.ts`), falling back to the old Dropbox folder. ✅
   - The four notes copied from Dropbox to iCloud Drive. ✅ The Dropbox copy is left in place.
   - *Check:* a note edited in the app on the Mac shows up in the Files app on the iPhone. ⏳
4. **Boards core.** Built and tested on Windows, 2026-10-20.
   - The app opens to the Home board. A **Boards** section in the sidebar lists all boards; **+** creates one.
   - Pan and zoom. Drag, resize, color and delete cards. Undo and redo.
   - Cards: text, an existing note (title and first lines; double-click opens it in the editor), images, and other boards.
   - Drop or paste images onto a board. They're copied into `Attachments/`.
   - *Check:* a board with 200 photos pans and zooms smoothly. ✅ 200 generated 12-megapixel photos, all on screen: 60 frames a second while panning, no frame over 50 ms.
   - *Check:* a board made in Vizual Notes opens in Obsidian with its cards and images in place. ⏳
5. **Columns and arrows.** Built and tested on Windows, 2026-10-20.
   - Cards dropped into a column stack top to bottom. When one is pulled out, the rest close up.
   - Drag from a card's edge to another card to draw an arrow. Arrows can have a label.
   - *Check:* columns and arrows open in Obsidian as groups and arrows. ⏳ The files use standard JSON Canvas groups and edges; not yet opened in Obsidian.
6. **Documents.** Built and tested on Windows, 2026-10-20.
   - PDFs show their first page; double-click opens a viewer.
   - Videos show a frame and play on the board.
   - Office files show a card with name and icon; double-click opens them in Office.
   - *Check:* a phone video, a PDF and a Word file can each be dropped on a board and opened. ✅ PDF, H.264 MP4 and HEVC `.MOV` (both play and seek), Word card. Opening Word itself still to try by hand.
7. **Tables, charts and diagrams.** Built and tested on Windows, 2026-10-20.
   - Markdown tables and Mermaid blocks in text cards are drawn on the board.
   - **Chart** in the toolbar adds a table, pie, bar or line chart, flowchart or timeline to edit.
   - *Check:* a table, a pie chart and a flowchart show correctly in Vizual Notes and in Obsidian. ✅ Vizual Notes. ⏳ Obsidian.
8. **Claude.** Built and tested on Windows, 2026-10-20: the MCP server in `mcp/` and [docs/board-format.md](docs/board-format.md).
   - A short guide to the board format in the project, so Claude Code builds valid boards.
   - A local MCP server for the Claude desktop app: list boards, read a board, add cards, columns and arrows.
   - *Check:* "make a mood board from these images" produces a board that opens correctly, from both Claude Code and the Claude desktop app. ✅ Over MCP from a test client: images, swatches, a column, a chart and an arrow, opened in the app. ⏳ From Claude Code and the Claude desktop app once the server is added to them.
9. **Mac importer test.** Built and tested on the Mac, 2026-10-20: `npm run import-notes` (code in `mac/`).
   - A script on the Mac reads the notes in the Notes folder **Capture**: text, formatting, lists, tables, images and attachments.
   - It writes each note to `Inbox/` as Markdown, with its images and attachments in `Attachments/`.
   - It deletes the note from Apple Notes only after the files are written and read back, and not if the note changed meanwhile or an attachment couldn't be exported.
   - Findings: images come either embedded in the note's HTML or as attachments, which Notes saves without a file extension; the importer handles both. Scanned documents can't be exported by script, so those notes stay in Apple Notes.
   - *Check:* a test note made on the Mac, with formatting, a list and an image, landed in `Inbox/` with its image and moved to Recently Deleted in Apple Notes. ✅ (test folder)
   - *Check:* a note captured on the iPhone, with a photo, appears in the app's Inbox on the Mac with its image. ⏳
10. **Inbox.** Built and tested on the Mac, 2026-10-20.
    - **Inbox** in the sidebar, with a count, lists the notes in `Inbox/`. On an Inbox note, **Tag** adds tags (suggesting ones in use) and **File** moves it to `Notes/` and opens the next.
    - The importer skips duplicates: the same version of a note, even after it was filed, and the same text captured twice.
    - `npm run import-notes:install` has launchd run the importer every 5 minutes and at login, logging to `~/Library/Logs/BT Notes/import.log`. A lock keeps a scheduled and a hand-run import from overlapping.
    - *Check:* notes captured into **Capture** land in the Inbox, a duplicate is skipped, and tagging and filing write the right files. ✅ On the Mac with a test folder: three notes, one a duplicate.
    - *Check:* 10 notes captured on the phone are in the app within 10 minutes, and gone from Apple Notes. ⏳ The schedule is installed (2026-10-20); needs the phone captures.
11. **iPhone app (Capacitor).**
    - Reading first, then editing.
    - Needs the Apple Developer Program ($99 a year) to install through TestFlight.
    - Until it's ready, the Files app can open the `.md` files, images, videos and PDFs in OneDrive.
    - The web version (phases 15–16) may make this unnecessary: decide after it's in use.
12. **Polish:** a screen for merging conflicting copies, export to PDF and HTML, themes.
13. **Move to personal OneDrive.**
    - Before paying: on the corporate network, sign in to OneDrive on the work laptop with a free personal Microsoft account (5 GB) and check that a test file syncs. Some companies block personal accounts on their network.
    - Subscribe to Microsoft 365 Basic (100 GB), and sign in to OneDrive with the personal account on the Mac, the work laptop and the iPhone.
    - On the Mac, copy `iCloud Drive/BT Notes` into `OneDrive/BT Notes`, and set it to **Always keep on this device**, so the app never waits on online-only files.
    - The app, the MCP server and the Apple Notes import look for the personal OneDrive folder first (`src/shared/notesRoot.ts`), then fall back to iCloud Drive.
    - Point the app at the new folder on each computer with **File → Change Notes Folder…**. On the work laptop, the work folder stays available the same way.
    - The iCloud copy stays as a backup for a month, then can be deleted.
    - *Check:* the same number of notes, boards and attachments in OneDrive as in iCloud, and 10 files spot-checked byte for byte.
    - *Check:* a note edited on the Mac appears on the work laptop within a minute, on the guest network and on the corporate network.
14. **iPhone capture.**
    - An Apple Shortcut, **Capture**: asks for text (typed or dictated) and optional photos, then saves a note in the app's format (front matter, a `# title`, the text, and `![](../Attachments/…)` links) to `OneDrive/BT Notes/Inbox/`, with the photos in `Attachments/`.
    - Started from the Home Screen, the Lock Screen, the Action Button or Siri, and from the share sheet in any app, for photos, links and selected text.
    - Step-by-step instructions for building it go in `docs/iphone-capture.md`, since a Shortcut can't be installed from a file.
    - *Check:* a capture with two photos, taken on the iPhone with the Mac off, is in the Inbox on the work laptop within a minute, with its photos.
    - *Check:* after a week of using the Shortcut, the Apple Notes import (phases 9–10) is turned off, or kept if it's still useful.
15. **Web app.**
    - Registered with Microsoft as an app for personal accounts, so it can ask for access to OneDrive. Sign-in is through Microsoft, and the app only gets the access the user grants.
    - The app's storage interface (`src/shared/types.ts`) gets a second version on Microsoft Graph, so the same screens run in a browser on the same `BT Notes` folder.
    - Boards, notes, images, PDFs (with pdf.js) and videos. Previews come from OneDrive, which makes thumbnails of images, videos and documents.
    - Changes from other devices come in through Graph's change tracking (delta queries).
    - Hosted on Vercel (Hobby plan).
    - *Check:* on a computer that has never had Vizual Notes, sign in at the web address, edit a board, and the change shows up in the Mac app within a minute.
16. **Phone.**
    - Layouts for a small screen; pinch to zoom, drag with a finger, and a long press for what right-click does.
    - Add a photo from the camera or photo library straight onto a board.
    - Added to the Home Screen, it opens full screen with its own icon, and keeps recent boards for reading without a connection.
    - *Check:* on the iPhone, from the Home Screen icon: open Home, add a photo from the camera to a board, and it appears on the Mac.

## Risks to check early

- **Personal OneDrive on the work laptop.** The laptop's OneDrive policy settings don't block a personal account (no `DisablePersonalSync` or tenant list, checked 2026-10-21), but the corporate network might block personal Microsoft sign-ins, IT could add a block later, and company rules may not allow it. Phase 13 tests the network before paying. Work notes stay in the work folder either way.
- **Online-only files.** OneDrive's Files On-Demand (and iCloud Drive's "Optimize Mac Storage") can keep files in the cloud until they're opened, which makes them slow to open the first time and may hide changes from the app.
  - Fix: right-click `BT Notes` and choose **Always keep on this device** (iCloud: **Keep Downloaded**), and fall back to checking for changes on a timer.
- **Conflicting edits.** When the same file is edited on two devices before they sync, the sync service keeps both versions as separate files. The app should detect these copies and offer to merge them.
- **Columns aren't part of JSON Canvas.** Obsidian shows a column as a plain group, and may drop the `btColumn` marker if the board is edited there.
- **Large images on boards.** Full-size phone photos can make a big board slow. Previews (see Board format) are the fix.
- **iPhone videos.** They're often HEVC `.mov` files. On this laptop they play in the app (tested 2026-10-20). Windows needs Microsoft's HEVC extension for that; without it, the card says so and double-click opens the normal player.
- **PDF previews on Windows.** Windows can't make PDF thumbnails, so the app draws the first page with pdf.js the first time it shows a PDF on a device, and keeps it with the other previews.
- **Mermaid charts.** Pie, bar and line charts only; nothing dashboard-style.
- **Apple Notes images.** Apple's scripting for Notes gets text out reliably, but images and attachments may not come through.
- **OneDrive on the iPhone.** The Shortcut and any iPhone app reach `BT Notes` through the OneDrive app's place in the Files app; the user picks the folder once.
- **Company policy.** Work material stays in the work folder on company storage, not in the personal OneDrive.
- **The web address is public.** Anyone can reach it, but only someone signed in to the personal Microsoft account can open the notes, and the app's access is limited to what that account grants. Check that before relying on it.
- **Prices change.** The Microsoft 365 and Vercel figures are from October 2026 comparisons, and one source mentions a Microsoft 365 price change; check the pricing pages before relying on them.
- **The iPhone can clear a website's stored data.** Safari may remove saved data from websites that aren't added to the Home Screen, so offline reading depends on using the Home Screen icon.

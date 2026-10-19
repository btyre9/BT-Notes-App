# BT Notes

Markdown notes with Bear's look and a few of Craft's features. Notes are plain `.md` files in a folder that Google Drive for desktop syncs. See [PLAN.md](PLAN.md) for the design and roadmap.

## Install on Windows

Build the installer:

```bash
npm install
npm run dist:win
```

Run `dist\BT Notes Setup 0.1.0.exe`.
- **No admin rights needed:** it installs for your user only, into `%LOCALAPPDATA%\Programs\BT Notes`, and adds Start menu and desktop shortcuts.
- **Windows warning:** the installer isn't code-signed, so the first time you run it Windows SmartScreen may say "Windows protected your PC". Choose **More info → Run anyway**.
- **Uninstall:** use **Settings → Apps**.

**If the build fails with `EPERM: operation not permitted, rename …electron-builder\Cache\…`:** security software is scanning the build tools electron-builder just unpacked, and is holding the folder open while it does. Wait a few seconds and run `npm run dist:win` again.

## Run from source

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

On first launch the app opens `G:\My Drive\BT Notes` if that folder exists. Otherwise it asks you to pick a folder. You can change the folder later with **File → Change Notes Folder…**.

To try the app on a different folder without changing your saved choice, set `BT_NOTES_ROOT` before starting it:

```bash
BT_NOTES_ROOT="D:\test-notes" npm run dev
```

## Using it

| Action | How |
|---|---|
| New note | **Ctrl+N** (**Cmd+N** on Mac), or **+** above the list |
| Search | **Ctrl+Shift+F**, or click the search box |
| Bold / italic / strikethrough | **Ctrl+B** / **Ctrl+I** / **Ctrl+Shift+X** |
| Tag a note | Type `#tag` or `#parent/child` anywhere in the note |
| Task | `- [ ] something`; click the checkbox to mark it done |
| Due date | `📅 2026-10-21` on a task line, or **Insert → Due date** |
| All open tasks | **Tasks** in the sidebar |
| Link to a note | Type `[[` and pick a note, or **Insert → Link to note** |
| Follow a link | Click it. On the line you're editing, **Ctrl+click** (**Cmd+click** on Mac) |
| Subpage | **Insert → Subpage**: creates a page and adds its card |
| Callout | `> [!note] Title`, or **Insert → Callout**. Other types: info, tip, important, warning, caution |
| Toggle | `> [!toggle]- Title` (closed) or `+` (open); click the arrow to open or close it |
| Daily note | **Daily notes** in the sidebar opens today's note; click a day in the calendar for others |
| Pin / trash | Buttons at the top right of the editor |

- **Saving and file names:** notes save automatically. Each file is named after the note's first line, except daily notes, which keep their date (`Daily/2026-10-19.md`).
- **Links when titles change:** when you change a note's title, links to it in other notes are updated.
- **Trash:** trashed notes move to `BT Notes/.Trash/`. To restore one, move it back.
- **Changes from other devices:** they show up within a few seconds. If file-change events don't come through, the app rescans the folder every 60 seconds.

## Development

```bash
npm test          # unit tests
npm run check     # type check
npm run build     # production build into out/
```

- `src/main/`: Electron main process. It reads, writes and watches the notes folder.
- `src/preload/`: the bridge between the window and the main process.
- `src/shared/types.ts`: the storage interface the UI uses. The iPhone app will implement the same interface on top of Google Drive.
- `src/renderer/`: the Svelte UI, the CodeMirror editor and search.

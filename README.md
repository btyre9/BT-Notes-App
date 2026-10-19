# BT Notes

Markdown notes with Bear's look and a few of Craft's features. Notes are plain `.md` files in a folder that Google Drive for desktop syncs. See [PLAN.md](PLAN.md) for the design and roadmap.

## Run it

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
| Pin / trash | Buttons at the top right of the editor |

- **Saving and file names:** notes save automatically. Each file is named after the note's first line.
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

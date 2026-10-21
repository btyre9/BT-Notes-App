# BT Notes

Boards of notes, images and text, on top of Markdown notes with Bear's look and a few of Craft's features. Notes are plain `.md` files and boards are `.canvas` files (Obsidian's JSON Canvas format) in a `BT Notes` folder in iCloud Drive. See [PLAN.md](PLAN.md) for the design and roadmap.

## Install on Windows

Build the installer:

```bash
npm install
npm run dist:win
```

Run `dist\BT Notes Setup 0.1.0.exe`. On a work laptop, use **File → Change Notes Folder…** to point it at a work folder, such as one in your company OneDrive (see [Folders](#folders)).
- **No admin rights needed:** it installs for your user only, into `%LOCALAPPDATA%\Programs\BT Notes`, and adds Start menu and desktop shortcuts.
- **Windows warning:** the installer isn't code-signed, so the first time you run it Windows SmartScreen may say "Windows protected your PC". Choose **More info → Run anyway**.
- **Uninstall:** use **Settings → Apps**.

**If the build fails with `EPERM: operation not permitted, rename …electron-builder\Cache\…`:** security software is scanning the build tools electron-builder just unpacked, and is holding the folder open while it does. Wait a few seconds and run `npm run dist:win` again.

## Install on a Mac

Mac apps have to be built on a Mac, so the steps run there.

1. Install Node.js 22 or newer: the macOS installer from [nodejs.org](https://nodejs.org).
2. Get the code into a folder in your home folder, not in iCloud Drive or another synced folder, since the next step downloads a few hundred MB that shouldn't sync:

   ```bash
   git clone https://github.com/btyre9/BT-Notes-App.git ~/BT-Notes-App
   ```
3. In Terminal:

   ```bash
   cd ~/BT-Notes-App
   npm install
   npm run dev
   ```

   The app opens `BT Notes` in iCloud Drive. That's enough to use it; it runs until you close Terminal.
   - **If it says "Electron uninstall":** run `node node_modules/electron/install.js` (npm sometimes skips Electron's download), then `npm run dev` again.
4. To install it as a normal app, run `npm run dist:mac`, open the `.dmg` it makes in `dist/`, and drag **BT Notes** to Applications.
   - **The app isn't signed by an Apple developer account**, so the first time, right-click it in Applications and choose **Open**, then **Open** again.
   - **If macOS says the app "is damaged"**, run `xattr -cr "/Applications/BT Notes.app"` in Terminal and open it again.

For Claude on the Mac, use the steps under [Claude](#claude) with `~/BT-Notes-App/mcp/server.ts` as the path.

## Run from source

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

## Folders

On first launch the app opens the first of these that exists, else it asks you to pick a folder:

1. `BT Notes` in iCloud Drive (on a Mac, `~/Library/Mobile Documents/com~apple~CloudDocs/BT Notes`; on Windows with iCloud for Windows, `~\iCloudDrive\BT Notes`)
2. `BT Notes` in Dropbox, where it used to live

Change it with **File → Change Notes Folder…**; the app, Claude's MCP server and the Apple Notes import all use the folder you pick. A work laptop can use a separate work folder this way, such as `OneDrive - Company\BT Notes`, so work notes stay on work storage.

To try the app on a different folder without changing your saved choice, set `BT_NOTES_ROOT` before starting it:

```bash
BT_NOTES_ROOT="D:\test-notes" npm run dev
```

## Using it

### Boards

The app opens to the **Home** board. Other boards are listed under **Boards** in the sidebar.

| Action | How |
|---|---|
| New board | **+** next to **Boards** in the sidebar, or **Board** in the toolbar to add one as a card |
| Text card | Double-click an empty spot, or **Text** in the toolbar. Double-click a card to edit it. Text cards are Markdown: `**bold**`, lists, `- [ ]` tasks, tables |
| Table, chart or diagram | **Chart** in the toolbar: table, pie, bar or line chart, flowchart, timeline. Double-click the card to change it. Charts are [Mermaid](https://mermaid.js.org) code in a ```` ```mermaid ```` block; a mistake shows what's wrong |
| Note card | **Note** in the toolbar: pick a note or create one. Double-click the card to open the note beside the board |
| Images and files | Drop or paste them onto the board, or **Files** in the toolbar. They're copied into `Attachments/` |
| PDFs | The card shows the first page. Double-click it to read the whole PDF; **Open in its app** opens it in your PDF reader |
| Videos | Press play on the card. Seeking and full screen work from its controls. Double-click opens it in your video player |
| Word, Excel, PowerPoint and other files | Double-click to open them in their app |
| Color swatch | **Color** in the toolbar. Double-click it to set the color with the color picker, a hex code, or the eyedropper (pick a color from anything on screen, such as a photo on the board), and give it a name |
| Column | **Column** in the toolbar. Drag cards into it and they stack top to bottom; drag one out and the rest close up. Double-click the column to rename it |
| Arrow | Hover a card and drag from the dot on one of its sides onto another card. Double-click an arrow to label it; click it to select, color or delete it |
| Open a board card | Double-click it. **←** goes back |
| Board icon | Select a board card and choose **Icon**, or click the icon left of a board's name. Pick a color and an icon, or **Use an image…**. The board's name shows under its card |
| Move / resize | Drag a card / drag its bottom-right corner. Shift+click selects more than one |
| Pan / zoom | Drag the background or scroll / **Ctrl+scroll** or pinch. The **%** button fits the board to the window |
| Color / delete | Select cards, then pick a color or the trash button in the toolbar (or **Delete**) |
| Undo / redo | **Ctrl+Z** / **Ctrl+Shift+Z** or **Ctrl+Y** |
| Rename / trash a board | Click its name in the toolbar / the trash button at the right. Home can't be renamed or trashed |

### Notes

| Action | How |
|---|---|
| New note | **Ctrl+N** (**Cmd+N** on Mac), or **+** above the list. On a board, **Ctrl+N** adds a new note card |
| Search | **Ctrl+Shift+F**, or click the search box |
| Bold / italic / strikethrough | **Ctrl+B** / **Ctrl+I** / **Ctrl+Shift+X** |
| Tag a note | Type `#tag` or `#parent/child` anywhere in the note |
| Task | `- [ ] something`; click the checkbox to mark it done |
| Due date | `📅 2026-10-21` on a task line, or **Insert → Due date** |
| All open tasks | **Tasks** in the sidebar |
| Link to a note | Type `[[` and pick a note, or **Insert → Link to note** |
| Follow a link | Click it. On the line you're editing, **Ctrl+click** (**Cmd+click** on Mac) |
| Image | `![](Attachments/photo.png)` or `![[Attachments/photo.png]]` shows the picture, at most the editor's width (`![[photo.png\|300]]` for 300 px). Paths start at the notes folder; `./` and `../` ones start at the note's folder. Click the picture to edit its link |
| Subpage | **Insert → Subpage**: creates a page and adds its card |
| Callout | `> [!note] Title`, or **Insert → Callout**. Other types: info, tip, important, warning, caution |
| Toggle | `> [!toggle]- Title` (closed) or `+` (open); click the arrow to open or close it |
| Daily note | **Daily notes** in the sidebar opens today's note; click a day in the calendar for others |
| Pin / trash | Buttons at the top right of the editor |
| Sort the Inbox | **Inbox** in the sidebar lists notes captured in Apple Notes (see [Apple Notes capture](#apple-notes-capture-mac)). Open one, choose **Tag** to add tags (Enter adds each one; existing tags are suggested), then **File** to move it to `Notes/` and open the next |

- **Saving and file names:** notes save automatically. Each file is named after the note's first line, except daily notes, which keep their date (`Daily/2026-10-19.md`).
- **Links when titles change:** when you change a note's title, links to it in other notes are updated.
- **Trash:** trashed notes and boards move to `BT Notes/.Trash/`. To restore one, move it back.
- **Image previews:** made on each device and kept in the app's settings folder, not in `BT Notes`.
- **Changes from other devices:** they show up within a few seconds. If file-change events don't come through, the app rescans the folder every 60 seconds.

## Claude

Claude can list, read and build boards through a small MCP server in `mcp/` that runs on this computer. It needs Node.js 22.18 or newer and this project's `npm install`. It uses the notes folder the app last opened (or `BT_NOTES_ROOT`).

**Claude desktop app:** add this to `%APPDATA%\Claude\claude_desktop_config.json` (on a Mac, `~/Library/Application Support/Claude/claude_desktop_config.json`), then restart Claude:

```json
{
  "mcpServers": {
    "bt-notes-boards": {
      "command": "node",
      "args": ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "D:/BT-Notes-App/mcp/server.ts"]
    }
  }
}
```

**Claude Code:**

```bash
claude mcp add --scope user bt-notes-boards -- node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON D:/BT-Notes-App/mcp/server.ts
```

Then ask, for example, "make a mood board called Kitchen from the photos in my Downloads folder, with a palette and a column of ideas". Changes appear in the app within a few seconds. If you're editing the same board in the app at that moment, your edit wins.

The tools: `list_boards`, `read_board`, `create_board`, `add_cards` (cards, columns, swatches, charts, arrows), `update_cards`, `remove_cards`. To write board files directly instead, see [docs/board-format.md](docs/board-format.md).

## Apple Notes capture (Mac)

Notes you jot down in Apple Notes, on the iPhone or the Mac, can move into BT Notes. Put them in a Notes folder called **Capture**, then run this on the Mac:

```bash
npm run import-notes
```

Each note becomes a Markdown file in `Inbox/`, with its images and attachments copied into `Attachments/`. Once the file is written and read back, the note is deleted from Apple Notes. Notes keeps deleted notes in **Recently Deleted** for 30 days.

- `npm run import-notes -- --dry-run` shows what would be imported, without writing or deleting anything.
- `npm run import-notes -- --keep` imports but leaves the notes in Apple Notes.
- `npm run import-notes -- --folder "Other folder"` imports from a different Notes folder.
- **First run:** macOS asks whether Terminal may control Notes. Choose **OK**.
- **Kept in Apple Notes:** password-locked notes are skipped. A note also stays in Apple Notes if one of its attachments can't be exported (scanned documents can't be), or if it was edited while being imported.
- **Run twice:** a note that was already imported isn't imported again, even after you've moved its file out of `Inbox/`. If you edit the note in Apple Notes afterwards, the new version is imported as a separate file.
- **Duplicates:** a note whose text matches one already imported (the same thing captured twice) isn't imported again, and is removed from Apple Notes. Notes with images or attachments are always imported.

It uses the notes folder the app last opened, or `BT_NOTES_ROOT`.

### Every 5 minutes, on its own

```bash
npm run import-notes:install
```

This has launchd, the Mac's scheduler, run the import every 5 minutes and at login, quietly in the background. Run it from the copy of BT Notes in your home folder (`~/BT-Notes-App`), not one on an external drive.

- **First scheduled run:** macOS asks whether node may control Notes. Choose **OK**.
- **What it did:** each import that found notes is listed in `~/Library/Logs/BT Notes/import.log`.
- **Check or stop it:** `npm run import-notes:status`, `npm run import-notes:uninstall`.
- **Test folder:** set `BT_NOTES_ROOT` when installing to have the scheduled import use that folder.
- **After moving the project or updating Node:** run `npm run import-notes:install` again, since the schedule remembers both paths.

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
- `mac/`: the Apple Notes importer. Like `mcp/`, Node runs it straight from TypeScript.
- `mcp/`: the MCP server for Claude. Node runs it straight from TypeScript, so it uses only syntax Node can strip: no enums or constructor parameter properties.

# BT Notes

Boards of notes, images and text, on top of Markdown notes with Bear's look and a few of Craft's features. Notes are plain `.md` files and boards are `.canvas` files (Obsidian's JSON Canvas format) in a folder that Dropbox syncs. See [PLAN.md](PLAN.md) for the design and roadmap.

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

## Install on a Mac

Mac apps have to be built on a Mac, so the steps run there.

1. Install Node.js 22 or newer: the macOS installer from [nodejs.org](https://nodejs.org).
2. Unzip `BT-Notes-App-source.zip` from your Dropbox to a folder outside Dropbox, such as `~/BT-Notes-App`. Outside, because the next step downloads a few hundred MB that shouldn't sync.
3. In Terminal:

   ```bash
   cd ~/BT-Notes-App
   npm install
   npm run dev
   ```

   The app opens your Dropbox `BT Notes` folder (in `~/Library/CloudStorage/Dropbox` or `~/Dropbox`). That's enough to use it; it runs until you close Terminal.
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

On first launch the app opens `Dropbox\BT Notes` in your user folder if that folder exists. Otherwise it asks you to pick a folder. You can change the folder later with **File → Change Notes Folder…**.

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
| Subpage | **Insert → Subpage**: creates a page and adds its card |
| Callout | `> [!note] Title`, or **Insert → Callout**. Other types: info, tip, important, warning, caution |
| Toggle | `> [!toggle]- Title` (closed) or `+` (open); click the arrow to open or close it |
| Daily note | **Daily notes** in the sidebar opens today's note; click a day in the calendar for others |
| Pin / trash | Buttons at the top right of the editor |

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
- `mcp/`: the MCP server for Claude. Node runs it straight from TypeScript, so it uses only syntax Node can strip: no enums or constructor parameter properties.

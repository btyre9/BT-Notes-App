# Board file format

Boards are [JSON Canvas](https://jsoncanvas.org) files (`.canvas`), the format Obsidian uses, with a few extra fields. They live in `Boards/` in the notes folder. This page is for anyone, including Claude Code, who writes board files directly instead of through the app or its MCP server.

The easiest way for Claude to change boards is the MCP server (see the README); it follows these rules for you.

## The file

```json
{
	"nodes": [ … cards … ],
	"edges": [ … arrows … ],
	"btIcon": { "icon": "car", "color": "1" }
}
```

- Tab-indented JSON. Keep fields you don't recognize; Obsidian and the app may have put them there.
- Positions and sizes are whole numbers, in board units. `x` grows to the right and `y` grows down.
- Every card and arrow needs an `id` that is unique in the file, such as 16 hex digits.
- Write the file in one go (for example to a temporary file, then rename it). The app watches the folder and reads changes within a few seconds.

## Cards (`nodes`)

| Card | Fields |
|---|---|
| Text | `"type": "text"`, `"text"`: Markdown. Tables are Markdown tables; charts and diagrams are a ```` ```mermaid ```` block |
| Note | `"type": "file"`, `"file": "Notes/Plan.md"` |
| Image, PDF, video, other file | `"type": "file"`, `"file": "Attachments/kitchen.jpg"`. Copy the file into `Attachments/` first |
| Another board | `"type": "file"`, `"file": "Boards/Ideas.canvas"`. Shown as a folder with the name under it; 150 × 160 fits it |
| Link | `"type": "link"`, `"url": "https://…"`. Optional page details the app shows as a preview: `btTitle`, `btDescription`, `btImage` (an https address), `btSite`; 300 × 270 fits one with an image |
| Group | `"type": "group"`, `"label"` |
| Wall (column) | A group with `"btColumn": true` and `"btCards": [card ids, top to bottom]`. The app calls these walls |
| Color swatch | A text card with `"btSwatch": true`, `"color": "#c8102e"`, and `"text": "#C8102E\nGuards Red"` (hex code, then an optional name) |
| Circle | A text card with `"styleAttributes": { "shape": "circle" }`, the way the Advanced Canvas plugin for Obsidian marks shapes. Keep its width and height equal |

Every card has `id`, `type`, `x`, `y`, `width` and `height`, and may have `color`: `"1"` to `"6"` (red, orange, yellow, green, cyan, purple) or a hex code.

### Columns

The app stacks a column's cards 14 units inside its left edge, starting 48 units below its top, 12 units apart, at the column's width minus 28, and fits the column's height to them. When writing a file directly, either lay the cards out that way or just list them in `btCards`; the app lays them out the next time the board changes. A card is in one column at most.

## Arrows (`edges`)

```json
{ "id": "…", "fromNode": "card id", "fromSide": "right", "toNode": "card id", "toSide": "left", "label": "leads to" }
```

- Sides are `top`, `right`, `bottom` or `left`. Without them, the app joins the sides that face each other.
- `toEnd` is `"arrow"` by default; `"none"` draws a plain line. `fromEnd: "arrow"` adds a head at the start.
- `color` works as it does for cards.
- **Line style** (BT Notes fields; Obsidian ignores them and draws a plain curve). Leave a field out for its default:
  - `btLine`: `"curved"` (default), `"straight"` or `"elbow"` (right angles with rounded corners)
  - `btPattern`: `"solid"` (default), `"dashed"` or `"dotted"`
  - `btWeight`: `"thin"`, `"medium"` (default) or `"thick"`
  - `btHead`: `"filled"` (default), `"closed"` (an outline) or `"open"` (two strokes)

## Canvas (`btCanvas`)

At the top level of a board's file, optional: `{ "theme": "light" | "dark" | "nord", "pattern": "dots" | "grid" | "lines" | "graph" }`. Leave a field out for the default: the system's light or dark theme, and no pattern.

## Board icon (`btIcon`)

At the top level of a board's own file: `icon` is a [Lucide](https://lucide.dev) icon name from the app's set (see `src/renderer/src/lib/boardIcons.ts`), `color` is the tile color, and `image` is a path such as `Attachments/cover.jpg` that's used instead of the icon.

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
| Another board | `"type": "file"`, `"file": "Boards/Ideas.canvas"`. Shown as an icon tile with the name under it; 120 × 158 fits it |
| Link | `"type": "link"`, `"url": "https://…"` |
| Group | `"type": "group"`, `"label"` |
| Column | A group with `"btColumn": true` and `"btCards": [card ids, top to bottom]` |
| Color swatch | A text card with `"btSwatch": true`, `"color": "#c8102e"`, and `"text": "#C8102E\nGuards Red"` (hex code, then an optional name) |

Every card has `id`, `type`, `x`, `y`, `width` and `height`, and may have `color`: `"1"` to `"6"` (red, orange, yellow, green, cyan, purple) or a hex code.

### Columns

The app stacks a column's cards 12 units inside its left edge, starting 44 units below its top, 10 units apart, at the column's width minus 24, and fits the column's height to them. When writing a file directly, either lay the cards out that way or just list them in `btCards`; the app lays them out the next time the board changes. A card is in one column at most.

## Arrows (`edges`)

```json
{ "id": "…", "fromNode": "card id", "fromSide": "right", "toNode": "card id", "toSide": "left", "label": "leads to" }
```

- Sides are `top`, `right`, `bottom` or `left`. Without them, the app joins the sides that face each other.
- `toEnd` is `"arrow"` by default; `"none"` draws a plain line. `fromEnd: "arrow"` adds a head at the start.
- `color` works as it does for cards.

## Board icon (`btIcon`)

At the top level of a board's own file: `icon` is a [Lucide](https://lucide.dev) icon name from the app's set (see `src/renderer/src/lib/boardIcons.ts`), `color` is the tile color, and `image` is a path such as `Attachments/cover.jpg` that's used instead of the icon.

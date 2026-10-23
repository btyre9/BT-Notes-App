/**
 * Vizual Notes (formerly BT Notes) boards for Claude: a local MCP server that lists, reads and builds the boards in the
 * notes folder. It runs on this computer over stdio; nothing is sent anywhere else.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON mcp/server.ts
 *
 * The notes folder is BT_NOTES_ROOT if set, else the folder the app last opened, else the
 * BT Notes folder in Google Drive or iCloud Drive (see src/shared/notesRoot.ts).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ARROW_ENDS, HEAD_SHAPES, LINE_PATTERNS, LINE_TYPES, LINE_WEIGHTS, SHAPES } from '../src/renderer/src/lib/board.ts'
import { notesRoot } from '../src/shared/notesRoot.ts'
import { addCards, BoardError, createBoard, listBoards, NotesFolder, readBoard, removeCards, updateCards } from './boards.ts'

const folder = new NotesFolder(notesRoot())

const INSTRUCTIONS = `Vizual Notes (formerly BT Notes; its notes folder is still called BT Notes) is the user's visual notes app. A board is a canvas of cards: text (Markdown), notes, images, PDFs, videos, files, links, color swatches, columns, and cards that open other boards. Arrows connect cards. The app opens to the Home board.

Making good boards:
- Start with list_boards, and read_board before changing a board, so you know what's there.
- Mood boards: images plus a few short text cards, with swatches for a color palette.
- Lists, steps and categories: make columns, then add cards into them with "column". Columns stack their cards top to bottom. The user calls columns "walls" (the app shows them as walls); use that word when talking to them, and kind "column" in these tools.
- Tables: Markdown tables in text cards. Charts and diagrams: a \`\`\`mermaid block in a text card (pie, xychart-beta bar/line, flowchart, timeline, mindmap). Note cards show only a plain preview of the note, so put tables and charts in text cards, not notes.
- Use arrows to show flow or cause and effect, with short labels. Arrows can be curved, straight or elbow (right angles), solid, dashed or dotted, thin to thick, with filled, outlined or open heads at either end; elbow lines suit process flows, dashed lines suit loose or optional links.
- Leave x/y out and cards are laid out in rows beside what's already on the board.
- For a big topic, create a board per subtopic and put board cards for them on the parent board.
Image and file paths can be anywhere on this computer; they're copied into the notes folder. Changes show up in the app within a few seconds.`

const server = new McpServer({ name: 'bt-notes-boards', version: '0.1.0' }, { instructions: INSTRUCTIONS })

/** Runs a tool, returning its result as JSON text, or a readable error. */
async function run(work: () => Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await work(), null, 2) }] }
  } catch (err) {
    const message = err instanceof BoardError ? err.message : `Something went wrong: ${(err as Error).message}`
    return { content: [{ type: 'text' as const, text: message }], isError: true }
  }
}

const boardParam = z.string().describe('A board name, such as "Home" or "Kitchen ideas", or its path, such as "Boards/Home.canvas".')

const cardSpec = z.object({
  ref: z.string().optional().describe('A name for this card within this request, so arrows and "column" can point at it.'),
  kind: z.enum(['text', 'note', 'image', 'file', 'link', 'board', 'swatch', 'column']),
  shape: z.enum(SHAPES).optional().describe('text: draw the card as a shape: circle, pill, diamond, triangle, hexagon, parallelogram, star, database (a cylinder) or document. Good for flowcharts: diamond for decisions, pill for start and end, database for data.'),
  text: z.string().optional().describe('text: the Markdown. note: the body of a new note. column: its name.'),
  title: z.string().optional().describe('note: the title of a new note (leave out "path").'),
  path: z
    .string()
    .optional()
    .describe('note: an existing note, e.g. "Notes/Plan.md". image/file: a file anywhere on this computer. board: a board name or path.'),
  url: z.string().optional().describe('link: the web address.'),
  color: z.string().optional().describe('swatch: its color as hex, e.g. "#c8102e". Other cards: a card color "1"–"6" (red, orange, yellow, green, cyan, purple) or hex.'),
  name: z.string().optional().describe('swatch: the color name. column: its name.'),
  column: z.string().optional().describe('Put the card into this column: its ref, id or name.'),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
})

/** An arrow's line style; anything left out keeps its current value, or the default on a new arrow. */
const lineStyle = {
  line: z.enum(LINE_TYPES).optional().describe('curved (default), straight, or elbow (right angles).'),
  pattern: z.enum(LINE_PATTERNS).optional().describe('solid (default), dashed or dotted.'),
  weight: z.enum(LINE_WEIGHTS).optional().describe('thin, medium (default) or thick.'),
  head: z.enum(HEAD_SHAPES).optional().describe('Arrowhead shape: filled (default), closed (outline) or open (two strokes).'),
  ends: z.enum(ARROW_ENDS).optional().describe('Which ends have arrowheads: end (default), start, both or none.'),
}

const arrowSpec = z.object({
  from: z.string().describe('A card ref from this request, or a card id from read_board.'),
  to: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
  ...lineStyle,
})

server.registerTool(
  'list_boards',
  {
    title: 'List boards',
    description: 'Lists every board in the notes folder with its number of cards and its columns.',
    annotations: { readOnlyHint: true },
  },
  () => run(() => listBoards(folder)),
)

server.registerTool(
  'read_board',
  {
    title: 'Read a board',
    description: "Returns a board's cards (id, kind, position, size, text, file, color, column) and arrows.",
    inputSchema: { board: boardParam },
    annotations: { readOnlyHint: true },
  },
  ({ board }) => run(() => readBoard(folder, board)),
)

server.registerTool(
  'create_board',
  {
    title: 'Create a board',
    description:
      'Creates an empty board, optionally with an icon, and optionally adds a card for it to another board (usually the board it belongs under, or "Home").',
    inputSchema: {
      name: z.string(),
      icon: z.string().optional().describe('A Lucide icon name, e.g. "car", "wrench", "lightbulb", "graduation-cap", "palette", "rocket".'),
      color: z.string().optional().describe('Tile color: "1"–"6" or hex.'),
      image: z.string().optional().describe('An image to use as the icon instead, anywhere on this computer.'),
      on_board: boardParam.optional().describe('Add a card for the new board to this board.'),
    },
  },
  ({ name, icon, color, image, on_board }) => run(() => createBoard(folder, name, { icon, color, image }, on_board)),
)

server.registerTool(
  'add_cards',
  {
    title: 'Add cards and arrows',
    description:
      'Adds cards to a board, and arrows between new or existing cards. Give cards a "ref" to connect them or to add cards into a column made in the same request. Cards without x/y are laid out in rows beside the existing cards.',
    inputSchema: {
      board: boardParam,
      cards: z.array(cardSpec).default([]),
      arrows: z.array(arrowSpec).default([]),
      per_row: z.number().int().min(1).max(12).default(4).describe('Cards per row when laying them out.'),
    },
  },
  ({ board, cards, arrows, per_row }) => run(() => addCards(folder, board, cards, arrows, per_row)),
)

server.registerTool(
  'update_cards',
  {
    title: 'Change cards',
    description: "Changes cards' text, color, name, position or size, or arrows' labels, colors and line styles, by id.",
    inputSchema: {
      board: boardParam,
      cards: z.array(
        z.object({
          id: z.string(),
          text: z.string().optional(),
          label: z.string().optional().describe("A column's name, or an arrow's label."),
          name: z.string().optional().describe("A swatch's color name, or a column's name."),
          color: z.string().optional(),
          x: z.number().optional(),
          y: z.number().optional(),
          width: z.number().optional(),
          height: z.number().optional(),
          ...lineStyle,
        }),
      ),
    },
  },
  ({ board, cards }) => run(() => updateCards(folder, board, cards)),
)

server.registerTool(
  'remove_cards',
  {
    title: 'Remove cards',
    description: 'Removes cards (and their arrows) or arrows from a board, by id. Notes and files themselves are kept.',
    inputSchema: { board: boardParam, ids: z.array(z.string()) },
    annotations: { destructiveHint: true },
  },
  ({ board, ids }) => run(() => removeCards(folder, board, ids)),
)

await server.connect(new StdioServerTransport())

/**
 * BT Notes boards for Claude: a local MCP server that lists, reads and builds the boards in the
 * notes folder. It runs on this computer over stdio; nothing is sent anywhere else.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON mcp/server.ts
 *
 * The notes folder is BT_NOTES_ROOT if set, else the folder the app last opened, else
 * iCloud Drive's BT Notes folder (see src/shared/notesRoot.ts).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { notesRoot } from '../src/shared/notesRoot.ts'
import { addCards, BoardError, createBoard, listBoards, NotesFolder, readBoard, removeCards, updateCards } from './boards.ts'

const folder = new NotesFolder(notesRoot())

const INSTRUCTIONS = `BT Notes is the user's visual notes app. A board is a canvas of cards: text (Markdown), notes, images, PDFs, videos, files, links, color swatches, columns, and cards that open other boards. Arrows connect cards. The app opens to the Home board.

Making good boards:
- Start with list_boards, and read_board before changing a board, so you know what's there.
- Mood boards: images plus a few short text cards, with swatches for a color palette.
- Lists, steps and categories: make columns, then add cards into them with "column". Columns stack their cards top to bottom.
- Tables: Markdown tables in text cards. Charts and diagrams: a \`\`\`mermaid block in a text card (pie, xychart-beta bar/line, flowchart, timeline, mindmap). Note cards show only a plain preview of the note, so put tables and charts in text cards, not notes.
- Use arrows to show flow or cause and effect, with short labels.
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

const arrowSpec = z.object({
  from: z.string().describe('A card ref from this request, or a card id from read_board.'),
  to: z.string(),
  label: z.string().optional(),
  color: z.string().optional(),
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
    description: "Changes cards' text, color, name, position or size, or arrows' labels and colors, by id.",
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

/**
 * Board work for the MCP server: finding, reading and changing the boards in a notes folder. It
 * uses the app's own board code, so what it writes follows the same rules as the app.
 */
import { constants, existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import {
  boardName,
  boundsOf,
  BOARD_EXT,
  BOARDS_DIR,
  colorOf,
  shapeOf,
  SHAPE_SIZES,
  SHAPES,
  type Shape,
  edgeStyle,
  setEdgeStyle,
  type EdgeStyle,
  DOC_SIZE,
  PDF_SIZE,
  columnCards,
  emptyBoard,
  facingSides,
  HOME_BOARD,
  isColumn,
  isImagePath,
  kindOf,
  layoutColumns,
  newId,
  parseBoard,
  removeNodes,
  serializeBoard,
  setSwatch,
  swatchOf,
  type CanvasData,
  type CanvasEdge,
  type CanvasNode,
} from '../src/renderer/src/lib/board.ts'
import { colorName, swatchNameAfter } from '../src/shared/colorNames.ts'
import { fetchLinkPreview } from '../src/shared/linkPreview.ts'
import { imageSize } from './imageSize.ts'

const ATTACHMENTS = 'Attachments'
const NOTES_DIR = 'Notes'
const GAP = 40

export class BoardError extends Error {}

const toPosix = (p: string) => p.split(sep).join('/')

export class NotesFolder {
  // A plain field, not a constructor parameter property: Node runs this file by stripping types,
  // which only works for TypeScript that's JavaScript plus annotations.
  readonly root: string

  constructor(root: string) {
    this.root = root
  }

  /** The absolute path of a path inside the folder; refuses paths that lead outside it. */
  abs(rel: string): string {
    const path = resolve(this.root, rel)
    if (!path.startsWith(resolve(this.root) + sep)) throw new BoardError(`${rel} is outside the notes folder`)
    return path
  }

  rel(abs: string): string {
    return toPosix(relative(this.root, abs))
  }

  /** Every board in the folder, outside hidden folders and Attachments/. */
  async boardPaths(dir = this.root): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    const nested = await Promise.all(
      entries.map((entry) => {
        if (entry.name.startsWith('.')) return []
        const path = join(dir, entry.name)
        if (entry.isDirectory()) return dir === this.root && entry.name === ATTACHMENTS ? [] : this.boardPaths(path)
        return entry.name.toLowerCase().endsWith(BOARD_EXT) ? [this.rel(path)] : []
      }),
    )
    return nested.flat()
  }

  /** Finds a board by path (`Boards/Ideas.canvas`) or name (`Ideas`), ignoring case. Home always exists. */
  async findBoard(board: string): Promise<string> {
    const wanted = board.trim().replace(/\\/g, '/').toLowerCase()
    const paths = await this.boardPaths()
    const found = paths.find((p) => p.toLowerCase() === wanted || boardName(p).toLowerCase() === wanted.replace(/\.canvas$/, ''))
    if (found) return found
    if (wanted === 'home' || wanted === HOME_BOARD.toLowerCase()) return HOME_BOARD
    const names = paths.map(boardName).join(', ') || 'none yet'
    throw new BoardError(`There's no board called "${board}". Boards: ${names}.`)
  }

  async read(path: string): Promise<CanvasData> {
    const abs = this.abs(path)
    if (!existsSync(abs)) return emptyBoard()
    const data = parseBoard(await fs.readFile(abs, 'utf8'))
    if (!data) throw new BoardError(`${path} isn't a valid board file, so it was left alone.`)
    return data
  }

  /**
   * Writes a board through a hidden temporary file and a rename, so the app (which skips hidden
   * files) never reads a half-written board.
   */
  async write(path: string, data: CanvasData): Promise<void> {
    layoutColumns(data)
    const abs = this.abs(path)
    await fs.mkdir(dirname(abs), { recursive: true })
    const temp = join(dirname(abs), `.${basename(abs)}.${process.pid}.tmp`)
    await fs.writeFile(temp, serializeBoard(data), 'utf8')
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(temp, abs)
        return
      } catch (err) {
        // Sync apps and virus scanners briefly lock files on Windows.
        if (attempt >= 10 || (err as NodeJS.ErrnoException).code !== 'EPERM') {
          await fs.rm(temp, { force: true })
          throw err
        }
        await new Promise((r) => setTimeout(r, 100))
      }
    }
  }

  /** Reads a board, changes it and writes it back. */
  async change<T>(board: string, fn: (data: CanvasData, path: string) => Promise<T> | T): Promise<T> {
    const path = await this.findBoard(board)
    const data = await this.read(path)
    const result = await fn(data, path)
    await this.write(path, data)
    return result
  }

  /** `dir/name.ext`, `dir/name 2.ext`… whichever is free. */
  private freePath(dir: string, name: string): string {
    const ext = extname(name)
    const base = ext ? name.slice(0, -ext.length) : name
    let candidate = `${dir}/${name}`
    for (let i = 2; existsSync(this.abs(candidate)); i++) candidate = `${dir}/${base} ${i}${ext}`
    return candidate
  }

  /** A path inside the folder for a file: used where it is if it's already inside, else copied into Attachments/. */
  async attach(source: string): Promise<string> {
    const abs = isAbsolute(source) ? resolve(source) : this.abs(source)
    if (!existsSync(abs)) throw new BoardError(`There's no file at ${source}`)
    if (abs.toLowerCase().startsWith(resolve(this.root).toLowerCase() + sep)) return this.rel(abs)
    await fs.mkdir(this.abs(ATTACHMENTS), { recursive: true })
    for (;;) {
      const rel = this.freePath(ATTACHMENTS, safeName(basename(abs)))
      try {
        await fs.copyFile(abs, this.abs(rel), constants.COPYFILE_EXCL)
        return rel
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }
    }
  }

  /** Creates a note in Notes/ named after its title. */
  async createNote(title: string, body: string): Promise<string> {
    await fs.mkdir(this.abs(NOTES_DIR), { recursive: true })
    const created = new Date().toISOString().slice(0, 19)
    const content = `---\ncreated: ${created}\n---\n# ${title}\n\n${body}\n`
    for (;;) {
      const rel = this.freePath(NOTES_DIR, `${safeName(title) || 'Untitled'}.md`)
      try {
        await fs.writeFile(this.abs(rel), content, { flag: 'wx' })
        return rel
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }
    }
  }

  async noteTitle(rel: string): Promise<string | undefined> {
    try {
      const text = await fs.readFile(this.abs(rel), 'utf8')
      return text.match(/^#\s+(.+)$/m)?.[1].trim()
    } catch {
      return undefined
    }
  }
}

/** A file name that's safe on Windows and macOS. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/^[. ]+|[. ]+$/g, '')
}

// ---- Reading ----

export interface CardSummary {
  id: string
  kind: string
  x: number
  y: number
  width: number
  height: number
  text?: string
  file?: string
  url?: string
  label?: string
  color?: string
  note_title?: string
  swatch?: { hex: string; name: string }
  /** For a text card drawn as a shape: its shape. */
  shape?: string
  /** The column the card is in. */
  column?: string
  /** For a column: its cards, top to bottom. */
  cards?: string[]
}

export async function listBoards(folder: NotesFolder) {
  const paths = await folder.boardPaths()
  if (!paths.some((p) => p.toLowerCase() === HOME_BOARD.toLowerCase())) paths.unshift(HOME_BOARD)
  return Promise.all(
    paths.map(async (path) => {
      const data = await folder.read(path).catch(() => null)
      return {
        board: path,
        name: boardName(path),
        cards: data?.nodes.length ?? 0,
        columns: data?.nodes.filter(isColumn).map((c) => c.label ?? '') ?? [],
        ...(data ? {} : { error: "This board file couldn't be read." }),
      }
    }),
  )
}

export async function readBoard(folder: NotesFolder, board: string) {
  const path = await folder.findBoard(board)
  const data = await folder.read(path)
  const columnOf = new Map<string, string>()
  for (const column of data.nodes.filter(isColumn)) for (const card of columnCards(data, column)) columnOf.set(card.id, column.id)
  const cards: CardSummary[] = await Promise.all(
    data.nodes.map(async (n) => {
      const kind = kindOf(n)
      const card: CardSummary = { id: n.id, kind, x: n.x, y: n.y, width: n.width, height: n.height }
      if (kind === 'swatch') card.swatch = swatchOf(n)
      const shape = shapeOf(n)
      if (shape) card.shape = shape
      else if (n.text !== undefined) card.text = n.text
      if (n.file) card.file = n.file
      if (n.url) card.url = n.url
      if (n.label) card.label = n.label
      if (n.color && kind !== 'swatch') card.color = n.color
      if (kind === 'note' && n.file) card.note_title = await folder.noteTitle(n.file)
      if (columnOf.has(n.id)) card.column = columnOf.get(n.id)
      if (kind === 'column') card.cards = columnCards(data, n).map((c) => c.id)
      return card
    }),
  )
  const arrows = data.edges.map((e) => ({
    id: e.id,
    from: e.fromNode,
    to: e.toNode,
    ...(e.label ? { label: e.label } : {}),
    ...(e.color ? { color: e.color } : {}),
    ...styleReport(e),
  }))
  return { board: path, name: boardName(path), cards, arrows }
}

// ---- Adding ----

export interface NewCard {
  /** A name for this card within the request, to point arrows or column placement at it. */
  ref?: string
  kind: 'text' | 'note' | 'image' | 'file' | 'link' | 'board' | 'swatch' | 'column'
  /** A text card drawn as a shape. */
  shape?: Shape
  text?: string
  title?: string
  path?: string
  url?: string
  color?: string
  name?: string
  column?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface NewArrow extends Partial<EdgeStyle> {
  from: string
  to: string
  label?: string
  color?: string
}

/** The style fields of a request, without the ones it left out. */
function styleOf(spec: Partial<EdgeStyle>): Partial<EdgeStyle> {
  const { line, pattern, weight, head, ends } = spec
  return Object.fromEntries(Object.entries({ line, pattern, weight, head, ends }).filter(([, v]) => v !== undefined))
}

/** An arrow's style as read_board reports it: only what differs from a plain arrow. */
function styleReport(edge: CanvasEdge): Partial<EdgeStyle> {
  const style = edgeStyle(edge)
  const plain = edgeStyle({ id: '', fromNode: '', toNode: '' })
  return Object.fromEntries(Object.entries(style).filter(([k, v]) => plain[k as keyof EdgeStyle] !== v))
}

/** A first guess at how tall a text card's rendered Markdown is. */
function textSize(text: string): { width: number; height: number } {
  if (/```mermaid/i.test(text)) return { width: 460, height: 340 }
  const lines = text.split('\n')
  const table = lines.filter((l) => /^\s*\|/.test(l)).length
  if (table) return { width: 420, height: Math.min(600, 50 + table * 30 + (lines.length - table) * 22) }
  const wrapped = lines.reduce((sum, l) => sum + Math.max(1, Math.ceil(l.length / 32)), 0)
  return { width: 260, height: Math.min(500, 30 + wrapped * 21) }
}

async function makeCard(folder: NotesFolder, data: CanvasData, spec: NewCard): Promise<CanvasNode> {
  const base = { id: newId(), x: 0, y: 0 }
  switch (spec.kind) {
    case 'text': {
      const text = spec.text ?? ''
      const shape = spec.shape && (SHAPES as readonly string[]).includes(spec.shape) ? spec.shape : null
      return {
        ...base,
        type: 'text',
        text,
        ...(shape ? { styleAttributes: { shape }, ...SHAPE_SIZES[shape] } : textSize(text)),
        ...(spec.color ? { color: spec.color } : {}),
      }
    }
    case 'note': {
      const file = spec.path ? folder.rel(folder.abs(spec.path)) : await folder.createNote(spec.title ?? 'Untitled', spec.text ?? '')
      if (!existsSync(folder.abs(file))) throw new BoardError(`There's no note at ${spec.path}`)
      return { ...base, type: 'file', file, width: 280, height: 220 }
    }
    case 'image':
    case 'file': {
      if (!spec.path) throw new BoardError(`A ${spec.kind} card needs a path`)
      const file = await folder.attach(spec.path)
      if (isImagePath(file)) {
        const size = await imageSize(folder.abs(file))
        return { ...base, type: 'file', file, width: 320, height: Math.round((320 * size.height) / size.width) }
      }
      const kind = kindOf({ ...base, type: 'file', file, width: 0, height: 0 })
      const size = kind === 'pdf' ? PDF_SIZE : kind === 'video' ? { width: 320, height: 180 } : DOC_SIZE
      return { ...base, type: 'file', file, ...size }
    }
    case 'link': {
      if (!spec.url) throw new BoardError('A link card needs a url')
      // The page's title, description, picture and site, as the app does for pasted links.
      const preview = await fetchLinkPreview(spec.url)
      const details = Object.fromEntries(
        Object.entries({ btTitle: preview?.title, btDescription: preview?.description, btImage: preview?.image, btSite: preview?.site }).filter(([, v]) => v),
      )
      return { ...base, type: 'link', url: spec.url, width: 300, height: preview?.image ? 270 : 110, ...details }
    }
    case 'board': {
      const file = await folder.findBoard(spec.path ?? spec.name ?? '')
      return { ...base, type: 'file', file, width: 150, height: 160 }
    }
    case 'swatch': {
      const hex = colorOf(spec.color)
      if (!hex) throw new BoardError(`A swatch needs a color such as "#c8102e"; got ${spec.color}`)
      const card: CanvasNode = { ...base, type: 'text', btSwatch: true, width: 160, height: 200 }
      const full = hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex
      // Unnamed swatches get the nearest named color's name, as in the app.
      setSwatch(card, full, spec.name ?? colorName(full))
      return card
    }
    case 'column':
      return {
        ...base,
        type: 'group',
        btColumn: true,
        btCards: [],
        label: spec.name ?? spec.text ?? '',
        width: 300,
        height: 108,
        ...(spec.color ? { color: spec.color } : {}),
      }
  }
}

/**
 * Adds cards and arrows to a board. Cards without a position are laid out in rows to the right of
 * what's already there; cards given a column are stacked in it.
 */
export async function addCards(folder: NotesFolder, board: string, cards: NewCard[], arrows: NewArrow[] = [], perRow = 4) {
  return folder.change(board, async (data, path) => {
    const byRef = new Map<string, CanvasNode>()
    const lookup = (key: string) => byRef.get(key) ?? data.nodes.find((n) => n.id === key)
    const findColumn = (key: string) =>
      byRef.get(key) ?? data.nodes.find((n) => isColumn(n) && (n.id === key || (n.label ?? '').toLowerCase() === key.toLowerCase()))

    const made: { spec: NewCard; node: CanvasNode }[] = []
    for (const spec of cards) {
      const node = await makeCard(folder, data, spec)
      if (spec.width) node.width = spec.width
      if (spec.height) node.height = spec.height
      if (spec.ref) byRef.set(spec.ref, node)
      made.push({ spec, node })
    }

    // Free cards go in rows to the right of the board's current contents.
    const bounds = boundsOf(data.nodes)
    let x = bounds ? bounds.x + bounds.width + 2 * GAP : 0
    const left = x
    let y = bounds ? bounds.y : 0
    let rowHeight = 0
    let inRow = 0
    for (const { spec, node } of made) {
      if (spec.column) continue
      if (spec.x !== undefined && spec.y !== undefined) {
        node.x = spec.x
        node.y = spec.y
        continue
      }
      if (inRow === perRow) {
        x = left
        y += rowHeight + GAP
        rowHeight = 0
        inRow = 0
      }
      node.x = Math.round(x)
      node.y = Math.round(y)
      x += node.width + GAP
      rowHeight = Math.max(rowHeight, node.height)
      inRow++
    }
    data.nodes.push(...made.map((m) => m.node))

    for (const { spec, node } of made) {
      if (!spec.column) continue
      const column = findColumn(spec.column)
      if (!column || !isColumn(column)) throw new BoardError(`There's no column "${spec.column}" on ${boardName(path)}`)
      if (node.type === 'group') throw new BoardError("Columns can't go inside columns")
      column.btCards = [...((column.btCards as string[] | undefined) ?? columnCards(data, column).map((c) => c.id)), node.id]
    }
    layoutColumns(data)

    const madeArrows: CanvasEdge[] = arrows.map((arrow) => {
      const from = lookup(arrow.from)
      const to = lookup(arrow.to)
      if (!from || !to) throw new BoardError(`An arrow points at a card that isn't there: ${!from ? arrow.from : arrow.to}`)
      const [fromSide, toSide] = facingSides(from, to)
      const edge: CanvasEdge = {
        id: newId(),
        fromNode: from.id,
        fromSide,
        toNode: to.id,
        toSide,
        ...(arrow.label ? { label: arrow.label } : {}),
        ...(arrow.color ? { color: arrow.color } : {}),
      }
      setEdgeStyle(edge, styleOf(arrow))
      return edge
    })
    data.edges.push(...madeArrows)

    return {
      board: path,
      cards: made.map(({ spec, node }) => ({ id: node.id, ...(spec.ref ? { ref: spec.ref } : {}), kind: spec.kind, ...(node.file ? { file: node.file } : {}) })),
      arrows: madeArrows.map((a) => a.id),
    }
  })
}

// ---- Changing ----

export interface CardChange extends Partial<EdgeStyle> {
  id: string
  text?: string
  label?: string
  name?: string
  color?: string
  x?: number
  y?: number
  width?: number
  height?: number
}

export async function updateCards(folder: NotesFolder, board: string, changes: CardChange[]) {
  return folder.change(board, (data) => {
    for (const change of changes) {
      const node = data.nodes.find((n) => n.id === change.id)
      const edge = data.edges.find((e) => e.id === change.id)
      if (edge) {
        if (change.label !== undefined) edge.label = change.label
        if (change.color !== undefined) edge.color = change.color
        setEdgeStyle(edge, styleOf(change))
        continue
      }
      if (!node) throw new BoardError(`There's no card or arrow ${change.id}`)
      if (kindOf(node) === 'swatch') {
        const current = swatchOf(node)
        const hex = colorOf(change.color) ?? current.hex
        setSwatch(node, hex, change.name ?? swatchNameAfter(current.hex, current.name, hex))
      } else {
        if (change.text !== undefined) node.text = change.text
        if (change.label !== undefined || change.name !== undefined) node.label = change.label ?? change.name
        if (change.color !== undefined) node.color = change.color
      }
      for (const key of ['x', 'y', 'width', 'height'] as const) if (change[key] !== undefined) node[key] = change[key]
    }
    return { updated: changes.length }
  })
}

export async function removeCards(folder: NotesFolder, board: string, ids: string[]) {
  return folder.change(board, (data) => {
    const set = new Set(ids)
    removeNodes(data, set)
    data.edges = data.edges.filter((e) => !set.has(e.id))
    return { removed: ids.length }
  })
}

export async function createBoard(folder: NotesFolder, name: string, icon?: { icon?: string; color?: string; image?: string }, onBoard?: string) {
  const base = safeName(name.trim())
  if (!base) throw new BoardError('A board needs a name')
  const existing = await folder.boardPaths()
  let path = `${BOARDS_DIR}${base}${BOARD_EXT}`
  for (let i = 2; existing.some((p) => p.toLowerCase() === path.toLowerCase()); i++) path = `${BOARDS_DIR}${base} ${i}${BOARD_EXT}`
  const data = emptyBoard()
  if (icon && (icon.icon || icon.color || icon.image)) {
    data.btIcon = Object.fromEntries(Object.entries({ ...icon, image: icon.image ? await folder.attach(icon.image) : undefined }).filter(([, v]) => v))
  }
  await folder.write(path, data)
  if (onBoard) await addCards(folder, onBoard, [{ kind: 'board', path }])
  return { board: path, name: boardName(path) }
}

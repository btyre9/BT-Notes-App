/**
 * Boards are JSON Canvas files (https://jsoncanvas.org), the format Obsidian uses, so the same
 * boards open in both apps. Fields this app doesn't use are kept as they are.
 */

export interface CanvasNode {
  id: string
  type: 'text' | 'file' | 'link' | 'group' | (string & {})
  x: number
  y: number
  width: number
  height: number
  /** A preset `'1'`–`'6'` or a hex color. */
  color?: string
  text?: string
  file?: string
  url?: string
  label?: string
  [key: string]: unknown
}

export type Side = 'top' | 'right' | 'bottom' | 'left'

export interface CanvasEdge {
  id: string
  fromNode: string
  toNode: string
  fromSide?: Side
  toSide?: Side
  /** `'arrow'` or `'none'`; JSON Canvas defaults to no arrowhead at the start and one at the end. */
  fromEnd?: string
  toEnd?: string
  color?: string
  label?: string
  [key: string]: unknown
}

export interface CanvasData {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  [key: string]: unknown
}

export type CardKind = 'text' | 'note' | 'board' | 'image' | 'pdf' | 'video' | 'file' | 'link' | 'group' | 'column' | 'swatch'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const BOARD_EXT = '.canvas'
export const BOARDS_DIR = 'Boards/'
export const HOME_BOARD = `${BOARDS_DIR}Home${BOARD_EXT}`

/** JSON Canvas presets, in Obsidian's colors: red, orange, yellow, green, cyan, purple. */
export const PRESET_COLORS: Record<string, string> = {
  '1': '#e5484d',
  '2': '#f08c2e',
  '3': '#e0b500',
  '4': '#30a46c',
  '5': '#12a5b8',
  '6': '#8e4ec6',
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|3gp)$/i

/** Documents, which get a page-shaped card in the app's color, with its letter. */
export const DOC_TYPES: { pattern: RegExp; app: 'word' | 'excel' | 'powerpoint' | 'text'; letter: string; label: string }[] = [
  { pattern: /\.(docx?|docm|rtf)$/i, app: 'word', letter: 'W', label: 'Word document' },
  { pattern: /\.(xlsx?|xlsm|csv)$/i, app: 'excel', letter: 'X', label: 'Excel workbook' },
  { pattern: /\.(pptx?|pptm)$/i, app: 'powerpoint', letter: 'P', label: 'PowerPoint presentation' },
  { pattern: /\.(txt|log|text)$/i, app: 'text', letter: 'TXT', label: 'Text file' },
]

/** A new document card: a page, taller than wide. */
export const DOC_SIZE = { width: 220, height: 290 }
/** A new PDF card: its band with the title, then a letter-size page. */
export const PDF_SIZE = { width: 240, height: 340 }

export const emptyBoard = (): CanvasData => ({ nodes: [], edges: [] })

export function isBoardPath(path: string): boolean {
  return path.toLowerCase().endsWith(BOARD_EXT)
}

export function isImagePath(path: string): boolean {
  return IMAGE_EXT.test(path)
}

/** File name without folder or `.canvas`. */
export function boardName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.canvas$/i, '')
}

/** What a card shows, from its type and, for files, the file's extension. */
export function kindOf(node: CanvasNode): CardKind {
  if (node.type === 'file' && node.file) {
    if (/\.md$/i.test(node.file)) return 'note'
    if (isBoardPath(node.file)) return 'board'
    if (isImagePath(node.file)) return 'image'
    if (/\.pdf$/i.test(node.file)) return 'pdf'
    if (VIDEO_EXT.test(node.file)) return 'video'
    return 'file'
  }
  if (node.type === 'link') return 'link'
  if (node.type === 'group') return node.btColumn === true ? 'column' : 'group'
  if (node.btSwatch === true) return 'swatch'
  return 'text'
}

// ---- Color swatches ----
//
// A swatch is a text card with `"btSwatch": true`, its color in `color`, and the hex code and an
// optional name as its text. Obsidian shows it as a card in that color with the hex code on it.

/** A swatch's color as `#rrggbb`, and its name. */
export function swatchOf(node: CanvasNode): { hex: string; name: string } {
  const color = colorOf(node.color) ?? '#888888'
  const hex = /^#[0-9a-f]{3}$/i.test(color) ? `#${[...color.slice(1)].map((c) => c + c).join('')}` : color.slice(0, 7)
  const lines = (node.text ?? '').split('\n')
  // The first line is the hex code, unless someone replaced it with a name.
  const name = (/^#[0-9a-f]{3,8}$/i.test(lines[0].trim()) ? lines.slice(1) : lines).join(' ').trim()
  return { hex: hex.toLowerCase(), name }
}

/** Sets a swatch's color and name, keeping its text (what Obsidian shows) in step. */
export function setSwatch(node: CanvasNode, hex: string, name: string): void {
  node.color = hex.toLowerCase()
  node.text = name ? `${hex.toUpperCase()}\n${name}` : hex.toUpperCase()
}

/** Cards whose content has a fixed shape (images, videos, PDF pages) keep it when resized. */
export function keepsShape(node: CanvasNode): boolean {
  const kind = kindOf(node)
  return kind === 'image' || kind === 'video' || kind === 'pdf' || isCircle(node)
}

/**
 * Shapes: text cards marked the way Obsidian's Advanced Canvas plugin marks them, in
 * `styleAttributes.shape`, so circles, pills, diamonds, parallelograms, cylinders ('database') and
 * documents show as shapes there too, and every shape shows as a plain text card without it.
 * Triangle, hexagon and star are the app's own.
 */
export const SHAPES = ['circle', 'pill', 'diamond', 'triangle', 'hexagon', 'parallelogram', 'star', 'database', 'document'] as const
export type Shape = (typeof SHAPES)[number]

/** A new shape's size: round shapes square, wide ones wide. */
export const SHAPE_SIZES: Record<Shape, { width: number; height: number }> = {
  circle: { width: 160, height: 160 },
  pill: { width: 220, height: 90 },
  diamond: { width: 190, height: 190 },
  triangle: { width: 190, height: 170 },
  hexagon: { width: 200, height: 174 },
  parallelogram: { width: 230, height: 110 },
  star: { width: 190, height: 190 },
  database: { width: 160, height: 190 },
  document: { width: 200, height: 150 },
}

export function shapeOf(node: CanvasNode): Shape | null {
  const style = node.styleAttributes
  if (node.type !== 'text' || typeof style !== 'object' || style === null) return null
  const shape = (style as Record<string, unknown>).shape
  return (SHAPES as readonly unknown[]).includes(shape) ? (shape as Shape) : null
}

/** A circle keeps its roundness when resized; other shapes stretch. */
export function isCircle(node: CanvasNode): boolean {
  return shapeOf(node) === 'circle'
}

export function colorOf(color: string | undefined): string | null {
  if (!color) return null
  if (Object.hasOwn(PRESET_COLORS, color)) return PRESET_COLORS[color]
  return /^#[0-9a-f]{3,8}$/i.test(color) ? color : null
}

/** A 16-digit hex id, the form Obsidian uses. */
export function newId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('')
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Reads a board file. Returns null if it isn't a JSON Canvas board, so it's never overwritten. */
export function parseBoard(content: string): CanvasData | null {
  if (!content.trim()) return emptyBoard()
  let raw: unknown
  try {
    raw = JSON.parse(content.replace(/^\uFEFF/, ''))
  } catch {
    return null
  }
  if (!isObject(raw)) return null
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : []
  const edges = Array.isArray(raw.edges) ? raw.edges : []
  const num = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback)
  // Cards and arrows need ids that are unique; a hand-edited file may repeat or leave them out.
  const seen = new Set<string>()
  const uniqueId = (id: unknown) => {
    let result = typeof id === 'string' && id ? id : newId()
    while (seen.has(result)) result = newId()
    seen.add(result)
    return result
  }
  return {
    ...raw,
    nodes: nodes.filter(isObject).map((n) => ({
      ...n,
      id: uniqueId(n.id),
      type: String(n.type ?? 'text'),
      x: num(n.x, 0),
      y: num(n.y, 0),
      width: num(n.width, 250),
      height: num(n.height, 60),
    })),
    edges: edges
      .filter((e): e is CanvasEdge => isObject(e) && typeof e.fromNode === 'string' && typeof e.toNode === 'string')
      .map((e) => ({ ...e, id: uniqueId(e.id) })),
  }
}

/** Tab-indented JSON, like Obsidian writes it. */
export function serializeBoard(data: CanvasData): string {
  return JSON.stringify(data, null, '\t')
}

/**
 * Copies cards, with new ids, along with the arrows between them; copied columns list the copies
 * of their cards. Returns the copies and a map from each original id to its copy's.
 */
export function duplicate(data: CanvasData, nodes: CanvasNode[]): { nodes: CanvasNode[]; edges: CanvasEdge[]; ids: Map<string, string> } {
  const ids = new Map(nodes.map((n) => [n.id, newId()]))
  const copies = nodes.map((n) => {
    const copy: CanvasNode = { ...structuredClone(n), id: ids.get(n.id)! }
    if (Array.isArray(copy.btCards)) copy.btCards = copy.btCards.flatMap((id) => ids.get(String(id)) ?? [])
    return copy
  })
  const edges = data.edges
    .filter((e) => ids.has(e.fromNode) && ids.has(e.toNode))
    .map((e) => ({ ...structuredClone(e), id: newId(), fromNode: ids.get(e.fromNode)!, toNode: ids.get(e.toNode)! }))
  return { nodes: copies, edges, ids }
}

/** Removes cards and any arrows attached to them. */
export function removeNodes(data: CanvasData, ids: Set<string>): void {
  data.nodes = data.nodes.filter((n) => !ids.has(n.id))
  data.edges = data.edges.filter((e) => !ids.has(e.fromNode) && !ids.has(e.toNode))
}

/** Points file cards at a file's new path. Returns true if any card changed. */
export function renameFile(data: CanvasData, from: string, to: string): boolean {
  let changed = false
  for (const node of data.nodes) {
    if (node.type === 'file' && node.file?.toLowerCase() === from.toLowerCase()) {
      node.file = to
      changed = true
    }
  }
  return changed
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** The smallest rectangle around all the given cards, or null if there are none. */
export function boundsOf(nodes: Rect[]): Rect | null {
  if (!nodes.length) return null
  const left = Math.min(...nodes.map((n) => n.x))
  const top = Math.min(...nodes.map((n) => n.y))
  const right = Math.max(...nodes.map((n) => n.x + n.width))
  const bottom = Math.max(...nodes.map((n) => n.y + n.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * Where to put a new card of the given size near a point: centered on it if that's clear, else
 * the nearest clear spot to the right and below, so new cards don't land on top of others.
 */
export function freeSpot(nodes: Rect[], cx: number, cy: number, width: number, height: number): { x: number; y: number } {
  const GAP = 24
  const x0 = Math.round(cx - width / 2)
  const y0 = Math.round(cy - height / 2)
  const clear = (x: number, y: number) =>
    !nodes.some((n) => intersects({ x: x - GAP / 2, y: y - GAP / 2, width: width + GAP, height: height + GAP }, n))
  // Rings of spots around the center, nearest first.
  for (let ring = 0; ring <= 12; ring++) {
    const spots: { x: number; y: number }[] = []
    for (let row = 0; row <= ring; row++) {
      for (let col = 0; col <= ring; col++) {
        if (Math.max(row, col) === ring) spots.push({ x: x0 + col * (width + GAP), y: y0 + row * (height + GAP) })
      }
    }
    const spot = spots.find((p) => clear(p.x, p.y))
    if (spot) return spot
  }
  return { x: x0, y: y0 }
}

// ---- Columns ----
//
// A column is a group with `"btColumn": true`. Its cards are listed in order in `btCards`, and the
// app stacks them top to bottom. Obsidian shows a column as a plain group with the cards inside.
// If `btCards` is missing, for example after the board was saved by another app, the cards inside
// the column are taken in order from top to bottom.

export const COLUMN = { pad: 14, header: 48, gap: 12, empty: 64 }

export function isColumn(node: CanvasNode): boolean {
  return node.type === 'group' && node.btColumn === true
}

const centerOf = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })
const holds = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height

/** A column's cards, in order. */
export function columnCards(data: CanvasData, column: CanvasNode): CanvasNode[] {
  const byId = new Map(data.nodes.map((n) => [n.id, n]))
  const listed = Array.isArray(column.btCards)
    ? column.btCards.flatMap((id) => byId.get(String(id)) ?? [])
    : data.nodes.filter((n) => n !== column && holds(column, centerOf(n))).sort((a, b) => a.y - b.y)
  return listed.filter((n) => n.type !== 'group')
}

/**
 * The column whose area holds a point, ignoring the given columns. The area reaches a little below
 * the column, so a card dropped just under its last card still goes in.
 */
export function columnAt(data: CanvasData, point: { x: number; y: number }, ignore: Set<string> = new Set()): CanvasNode | null {
  const area = (n: CanvasNode) => ({ ...n, height: n.height + COLUMN.empty })
  return data.nodes.findLast((n) => isColumn(n) && !ignore.has(n.id) && holds(area(n), point)) ?? null
}

/** Draws the given cards above the others, keeping groups and columns behind. */
export function bringToFront(data: CanvasData, ids: Set<string>): void {
  const front = data.nodes.filter((n) => ids.has(n.id) && n.type !== 'group')
  if (front.length) data.nodes = [...data.nodes.filter((n) => !front.includes(n)), ...front]
}

/**
 * Stacks every column's cards top to bottom at the column's width, and fits the column's height.
 * Images keep their shape; `ratios` (height / width by card id) keeps it exact while a column is
 * resized in many small steps, where rounding each step would slowly change it.
 */
export function layoutColumns(data: CanvasData, ratios?: Map<string, number>): void {
  const claimed = new Set<string>()
  for (const column of data.nodes.filter(isColumn)) {
    // A card is in one column at most, and only once; the first column that lists it keeps it.
    const cards = columnCards(data, column).filter((n) => !claimed.has(n.id) && claimed.add(n.id))
    column.btCards = cards.map((n) => n.id)
    const width = column.width - 2 * COLUMN.pad
    let y = column.y + COLUMN.header
    for (const card of cards) {
      if (keepsShape(card) && card.width > 0 && card.width !== width) {
        card.height = Math.round(width * (ratios?.get(card.id) ?? card.height / card.width))
      }
      card.x = column.x + COLUMN.pad
      card.y = y
      card.width = width
      y += card.height + COLUMN.gap
    }
    column.height = cards.length ? y - COLUMN.gap + COLUMN.pad - column.y : COLUMN.header + COLUMN.empty
  }
}

/**
 * Moves cards into the column under a point, in order of where they sit, or out of their columns
 * if there's no column there. Returns the column they went into.
 */
export function dropIntoColumn(
  data: CanvasData,
  ids: string[],
  point: { x: number; y: number },
  /** Columns being moved along with the cards, which can't take them. */
  movingColumns: Set<string> = new Set(),
): CanvasNode | null {
  const moving = new Set(ids)
  const target = columnAt(data, point, movingColumns)
  for (const column of data.nodes.filter(isColumn)) {
    column.btCards = columnCards(data, column)
      .map((n) => n.id)
      .filter((id) => !moving.has(id))
  }
  if (target) {
    const byId = new Map(data.nodes.map((n) => [n.id, n]))
    const cards = ids.flatMap((id) => byId.get(id) ?? []).filter((n) => n.type !== 'group')
    cards.sort((a, b) => a.y - b.y)
    const list = target.btCards as string[]
    const index = list.filter((id) => centerOf(byId.get(id)!).y < point.y).length
    list.splice(index, 0, ...cards.map((n) => n.id))
  }
  layoutColumns(data)
  return target
}

// ---- Arrows ----

const NORMALS: Record<Side, { x: number; y: number }> = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
}

/** The middle of one side of a card. */
export function anchor(r: Rect, side: Side): { x: number; y: number } {
  const c = centerOf(r)
  if (side === 'top') return { x: c.x, y: r.y }
  if (side === 'bottom') return { x: c.x, y: r.y + r.height }
  if (side === 'left') return { x: r.x, y: c.y }
  return { x: r.x + r.width, y: c.y }
}

/** The side of a card closest to a point. */
export function nearestSide(r: Rect, p: { x: number; y: number }): Side {
  const sides: Side[] = ['top', 'right', 'bottom', 'left']
  const dist = (s: Side) => Math.hypot(anchor(r, s).x - p.x, anchor(r, s).y - p.y)
  return sides.reduce((best, s) => (dist(s) < dist(best) ? s : best))
}

/**
 * Sides for an arrow that doesn't name them: the ones facing each other across the wider gap, so
 * cards side by side are joined left to right even when one is much wider than it is tall.
 */
export function facingSides(a: Rect, b: Rect): [Side, Side] {
  const ca = centerOf(a)
  const cb = centerOf(b)
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width))
  const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height))
  // Overlapping cards have no gap either way; then the direction between their centers decides.
  const across = gapX > 0 || gapY > 0 ? gapX >= gapY : Math.abs(dx) >= Math.abs(dy)
  if (across) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
}

// ---- Where a folder is ----

/** The boards a board holds as folder cards, in card order. */
export function childBoards(data: CanvasData): string[] {
  return data.nodes.filter((n) => n.type === 'file' && typeof n.file === 'string' && isBoardPath(n.file)).map((n) => n.file as string)
}

/**
 * The shortest way from Home down to a board through folder cards, as board paths from Home to
 * the board, or null if no board on the way from Home holds it. Paths compare without case.
 */
export function pathFromHome(boards: Iterable<{ path: string; data: CanvasData }>, target: string): string[] | null {
  const byKey = new Map([...boards].map((b) => [b.path.toLowerCase(), b]))
  const home = byKey.get(HOME_BOARD.toLowerCase())
  if (!home) return null
  const goal = target.toLowerCase()
  const cameFrom = new Map<string, string | null>([[home.path.toLowerCase(), null]])
  const queue = [home.path]
  while (queue.length) {
    const path = queue.shift()!
    if (path.toLowerCase() === goal) {
      const route: string[] = []
      for (let at: string | null = path; at; at = cameFrom.get(at.toLowerCase()) ?? null) route.unshift(byKey.get(at.toLowerCase())?.path ?? at)
      return route
    }
    for (const child of childBoards(byKey.get(path.toLowerCase())?.data ?? { nodes: [], edges: [] })) {
      if (cameFrom.has(child.toLowerCase()) || !byKey.has(child.toLowerCase())) continue
      cameFrom.set(child.toLowerCase(), path)
      queue.push(child)
    }
  }
  return null
}

/**
 * For a board no route from Home reaches: the boards above it, found by walking up through
 * boards that hold it as a folder card, from the top one down to the board itself.
 */
export function parentChain(boards: Iterable<{ path: string; data: CanvasData }>, target: string): string[] {
  const list = [...boards]
  const route = [list.find((b) => b.path.toLowerCase() === target.toLowerCase())?.path ?? target]
  const seen = new Set([target.toLowerCase()])
  for (;;) {
    const below = route[0].toLowerCase()
    const parent = list.find((b) => !seen.has(b.path.toLowerCase()) && childBoards(b.data).some((c) => c.toLowerCase() === below))
    if (!parent) return route
    route.unshift(parent.path)
    seen.add(parent.path.toLowerCase())
  }
}

/** A value if it's one of the allowed ones, else the fallback. */
const pick = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : fallback

// ---- Canvas look ----
// A board's canvas theme and background pattern, kept in its file as `btCanvas` like its icon, so
// each board can look its own way on every device. Left out when both are the default.

export const CANVAS_THEMES = ['system', 'light', 'dark', 'nord'] as const
export const CANVAS_PATTERNS = ['none', 'dots', 'grid', 'lines', 'graph'] as const

export interface CanvasLook {
  theme: (typeof CANVAS_THEMES)[number]
  pattern: (typeof CANVAS_PATTERNS)[number]
}

export function canvasLookOf(data: CanvasData | undefined): CanvasLook {
  const raw = (data?.btCanvas ?? {}) as Record<string, unknown>
  return { theme: pick(raw.theme, CANVAS_THEMES, 'system'), pattern: pick(raw.pattern, CANVAS_PATTERNS, 'none') }
}

export function setCanvasLook(data: CanvasData, change: Partial<CanvasLook>): void {
  const look = { ...canvasLookOf(data), ...change }
  const stored = Object.fromEntries(
    Object.entries({ theme: look.theme === 'system' ? undefined : look.theme, pattern: look.pattern === 'none' ? undefined : look.pattern }).filter(([, v]) => v),
  )
  if (Object.keys(stored).length) data.btCanvas = stored
  else delete data.btCanvas
}

// ---- Arrow styles ----
// Stored on the arrow as btLine, btPattern, btWeight and btHead, like btColumn on columns, and
// left out when they're the default so a plain arrow stays plain JSON Canvas. Arrowheads use
// JSON Canvas's own fromEnd and toEnd.

export const LINE_TYPES = ['curved', 'straight', 'elbow'] as const
export const LINE_PATTERNS = ['solid', 'dashed', 'dotted'] as const
export const LINE_WEIGHTS = ['thin', 'medium', 'thick'] as const
export const HEAD_SHAPES = ['filled', 'closed', 'open'] as const
export const ARROW_ENDS = ['none', 'end', 'start', 'both'] as const

export interface EdgeStyle {
  line: (typeof LINE_TYPES)[number]
  pattern: (typeof LINE_PATTERNS)[number]
  weight: (typeof LINE_WEIGHTS)[number]
  head: (typeof HEAD_SHAPES)[number]
  ends: (typeof ARROW_ENDS)[number]
}

/** An arrow's style, with the defaults for anything not set: a medium, solid curve with a filled head at the end. */
export function edgeStyle(edge: CanvasEdge): EdgeStyle {
  const start = edge.fromEnd === 'arrow'
  const end = edge.toEnd !== 'none'
  return {
    line: pick(edge.btLine, LINE_TYPES, 'curved'),
    pattern: pick(edge.btPattern, LINE_PATTERNS, 'solid'),
    weight: pick(edge.btWeight, LINE_WEIGHTS, 'medium'),
    head: pick(edge.btHead, HEAD_SHAPES, 'filled'),
    ends: start && end ? 'both' : start ? 'start' : end ? 'end' : 'none',
  }
}

/** Changes parts of an arrow's style, removing fields that go back to their defaults. */
export function setEdgeStyle(edge: CanvasEdge, change: Partial<EdgeStyle>): void {
  const field = (key: string, value: string | undefined, fallback: string) => {
    if (value === undefined) return
    if (value === fallback) delete edge[key]
    else edge[key] = value
  }
  field('btLine', change.line, 'curved')
  field('btPattern', change.pattern, 'solid')
  field('btWeight', change.weight, 'medium')
  field('btHead', change.head, 'filled')
  if (change.ends) {
    const start = change.ends === 'start' || change.ends === 'both'
    const end = change.ends === 'end' || change.ends === 'both'
    if (start) edge.fromEnd = 'arrow'
    else delete edge.fromEnd
    if (end) delete edge.toEnd
    else edge.toEnd = 'none'
  }
}

export interface EdgeShape {
  /** SVG path data for the curve. */
  d: string
  /** Arrowhead outlines at the start and end. */
  startHead: string
  endHead: string
  /** Where the label goes. */
  mid: { x: number; y: number }
}

type Point = { x: number; y: number }

/** An arrowhead at a tip, pointing along dir: a closed triangle, or for 'open' just its two sides. */
function head(tip: Point, dir: Point, size: number, shape: EdgeStyle['head'] = 'filled'): string {
  const len = Math.hypot(dir.x, dir.y) || 1
  const ux = dir.x / len
  const uy = dir.y / len
  const bx = tip.x - ux * size
  const by = tip.y - uy * size
  const w = size * (shape === 'open' ? 0.6 : 0.55)
  const r = (n: number) => Math.round(n * 10) / 10
  const left = `${r(bx - uy * w)},${r(by + ux * w)}`
  const right = `${r(bx + uy * w)},${r(by - ux * w)}`
  const point = `${r(tip.x)},${r(tip.y)}`
  return shape === 'open' ? `M${left} L${point} L${right}` : `M${point} L${left} L${right} Z`
}

/** How far an elbow line runs straight out of a card before its first turn. */
const ELBOW_LEAD = 24
/** The radius of an elbow line's corners. */
const ELBOW_RADIUS = 10

/** The corners of a right-angled line from a side of one card to a side of another, or to a point. */
function elbowPoints(p0: Point, n0: Point, p3: Point, n3: Point | null): Point[] {
  const s = { x: p0.x + n0.x * ELBOW_LEAD, y: p0.y + n0.y * ELBOW_LEAD }
  const e = n3 ? { x: p3.x + n3.x * ELBOW_LEAD, y: p3.y + n3.y * ELBOW_LEAD } : p3
  const startAcross = n0.x !== 0
  // Without an end side, turn once toward the point.
  const endAcross = n3 ? n3.x !== 0 : !startAcross
  let turns: Point[]
  if (startAcross && endAcross) {
    const mx = (s.x + e.x) / 2
    turns = [{ x: mx, y: s.y }, { x: mx, y: e.y }]
  } else if (!startAcross && !endAcross) {
    const my = (s.y + e.y) / 2
    turns = [{ x: s.x, y: my }, { x: e.x, y: my }]
  } else {
    turns = [startAcross ? { x: e.x, y: s.y } : { x: s.x, y: e.y }]
  }
  const points = [p0, s, ...turns, e, ...(n3 ? [p3] : [])]
  // Drop repeated points and points in the middle of a straight run, so every point left is a corner.
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (last && Math.abs(last.x - p.x) < 0.01 && Math.abs(last.y - p.y) < 0.01) continue
    const before = out[out.length - 2]
    if (before && last && Math.abs((last.x - before.x) * (p.y - last.y) - (last.y - before.y) * (p.x - last.x)) < 0.01) out.pop()
    out.push(p)
  }
  return out
}

/** SVG path data through points, with rounded corners. */
function roundedPath(points: Point[], radius: number): string {
  const r = (n: number) => Math.round(n * 10) / 10
  let d = `M${r(points[0].x)},${r(points[0].y)}`
  for (let i = 1; i < points.length - 1; i++) {
    const [a, c, b] = [points[i - 1], points[i], points[i + 1]]
    const inLen = Math.hypot(c.x - a.x, c.y - a.y)
    const outLen = Math.hypot(b.x - c.x, b.y - c.y)
    const rr = Math.min(radius, inLen / 2, outLen / 2)
    const p1 = { x: c.x - ((c.x - a.x) / inLen) * rr, y: c.y - ((c.y - a.y) / inLen) * rr }
    const p2 = { x: c.x + ((b.x - c.x) / outLen) * rr, y: c.y + ((b.y - c.y) / outLen) * rr }
    d += ` L${r(p1.x)},${r(p1.y)} Q${r(c.x)},${r(c.y)} ${r(p2.x)},${r(p2.y)}`
  }
  const last = points[points.length - 1]
  return `${d} L${r(last.x)},${r(last.y)}`
}

/** The point halfway along a line through points, for the label. */
function halfway(points: Point[]): Point {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let left = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      const t = lengths[i] ? left / lengths[i] : 0
      return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t }
    }
    left -= lengths[i]
  }
  return points[points.length - 1]
}

/**
 * The line of an arrow from a side of one card to a side of another, or to a point while one is
 * being drawn. A curve leaves and enters each card straight out from the side, like Obsidian's;
 * an elbow line does the same with right angles; a straight line runs side to side directly.
 */
export function edgeShape(
  from: Rect,
  fromSide: Side,
  to: Rect | Point,
  toSide: Side | null,
  ends: { start: boolean; end: boolean },
  headSize = 14,
  style: Pick<EdgeStyle, 'line' | 'head'> = { line: 'curved', head: 'filled' },
): EdgeShape {
  const p0 = anchor(from, fromSide)
  const p3 = 'width' in to && toSide ? anchor(to, toSide) : { x: to.x, y: to.y }
  const n0 = NORMALS[fromSide]
  const n3 = toSide ? NORMALS[toSide] : null
  const r = (n: number) => Math.round(n * 10) / 10
  const heads = (startDir: Point, endDir: Point) => ({
    startHead: ends.start ? head(p0, startDir, headSize, style.head) : '',
    endHead: ends.end ? head(p3, endDir, headSize, style.head) : '',
  })

  if (style.line === 'straight') {
    const dir = { x: p3.x - p0.x, y: p3.y - p0.y }
    return {
      d: `M${r(p0.x)},${r(p0.y)} L${r(p3.x)},${r(p3.y)}`,
      ...heads({ x: -dir.x, y: -dir.y }, dir),
      mid: { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 },
    }
  }

  if (style.line === 'elbow') {
    const points = elbowPoints(p0, n0, p3, n3)
    const second = points[1] ?? p3
    const beforeLast = points[points.length - 2] ?? p0
    return {
      d: roundedPath(points, ELBOW_RADIUS),
      ...heads({ x: p0.x - second.x, y: p0.y - second.y }, { x: p3.x - beforeLast.x, y: p3.y - beforeLast.y }),
      mid: halfway(points),
    }
  }

  const reach = Math.max(40, Math.min(160, Math.hypot(p3.x - p0.x, p3.y - p0.y) / 2))
  const c1 = { x: p0.x + n0.x * reach, y: p0.y + n0.y * reach }
  const c2 = n3 ? { x: p3.x + n3.x * reach, y: p3.y + n3.y * reach } : p3
  return {
    d: `M${r(p0.x)},${r(p0.y)} C${r(c1.x)},${r(c1.y)} ${r(c2.x)},${r(c2.y)} ${r(p3.x)},${r(p3.y)}`,
    // Without an end side the last control point sits on the tip, so aim from the first one.
    ...heads({ x: p0.x - c1.x, y: p0.y - c1.y }, n3 ? { x: p3.x - c2.x, y: p3.y - c2.y } : { x: p3.x - c1.x, y: p3.y - c1.y }),
    mid: { x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8 },
  }
}

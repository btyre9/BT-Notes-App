<script lang="ts">
  import { untrack } from 'svelte'
  import {
    boardName,
    boundsOf,
    bringToFront,
    colorOf,
    COLUMN,
    columnAt,
    columnCards,
    contains,
    DOC_SIZE,
    dropIntoColumn,
    duplicate,
    edgeShape,
    facingSides,
    freeSpot,
    HOME_BOARD,
    intersects,
    isCircle,
    isColumn,
    keepsShape,
    kindOf,
    layoutColumns,
    nearestSide,
    newId,
    PDF_SIZE,
    PRESET_COLORS,
    edgeStyle,
    canvasLookOf,
    setCanvasLook,
    type CanvasLook,
    setEdgeStyle,
    type EdgeStyle,
    removeNodes,
    setSwatch,
    swatchOf,
    type CanvasEdge,
    type CanvasNode,
    type Side,
  } from '../lib/board'
  import { boards, type View } from '../lib/boards.svelte'
  import { store } from '../lib/store.svelte'
  import { boardIconOf, type BoardIcon } from '../lib/boardIcons'
  import BoardCard from './BoardCard.svelte'
  import BoardIconPicker from './BoardIconPicker.svelte'
  import ColorPalette from './ColorPalette.svelte'
  import BoardTile from './BoardTile.svelte'
  import CardPicker from './CardPicker.svelte'
  import Icon from './Icon.svelte'
  import { colorName, swatchNameAfter } from '../../../shared/colorNames'
  import CanvasPicker from './CanvasPicker.svelte'
  import DockIcon, { type DockTool } from './DockIcon.svelte'
  import LineStylePicker from './LineStylePicker.svelte'
  import Minimap from './Minimap.svelte'

  const MIN_ZOOM = 0.1
  const MAX_ZOOM = 4
  const IMAGE_WIDTH = 320
  /** Pointer travel, in screen pixels, before a press on a card becomes a drag. */
  const DRAG_THRESHOLD = 3

  type Gesture =
    | { kind: 'pan'; startX: number; startY: number; from: View }
    | {
        kind: 'move'
        startX: number
        startY: number
        origins: { node: CanvasNode; x: number; y: number }[]
        moved: boolean
        clickedId: string
        collapseTo: boolean
        /** Cards that can go into or come out of a column: not columns, nor cards moving with one. */
        loose: string[]
        /** Alt was held: the drag moves copies and leaves the cards where they were. */
        copy: boolean
      }
    | {
        kind: 'resize'
        startX: number
        startY: number
        node: CanvasNode
        width: number
        height: number
        ratio: number | null
        /** For a column: the shapes of the images in it when the resize started. */
        ratios: Map<string, number>
        moved: boolean
      }
    | { kind: 'connect'; startX: number; startY: number }

  const SIDES = new Set<string>(['top', 'right', 'bottom', 'left'])
  const isSide = (side: unknown): side is Side => typeof side === 'string' && SIDES.has(side)

  let viewport: HTMLDivElement
  let imageInput: HTMLInputElement
  let width = $state(0)
  let height = $state(0)
  let editingId = $state<string | null>(null)
  let picker = $state<'note' | 'board' | 'chart' | 'shape' | null>(null)
  /** A text card that was just edited or added, which grows to fit its rendered text. */
  let autosizeId = $state<string | null>(null)
  /** The board whose icon is being chosen, from its card or from its own title. */
  let iconFor = $state<string | null>(null)
  /** A PDF or image open in the viewer over the board. */
  let viewing = $state<{ path: string; kind: 'pdf' | 'image' } | null>(null)
  let dropping = $state(false)
  let gesture: Gesture | null = null
  /** The column that cards being dragged would go into. */
  let dropColumnId = $state<string | null>(null)
  /** An arrow being drawn from a card's side to the pointer, or to the card under it. */
  let connecting = $state<{ from: CanvasNode; side: Side; point: { x: number; y: number }; targetId: string | null } | null>(null)

  const board = $derived(boards.board)
  const nodes = $derived(board?.data.nodes ?? [])
  const isHome = $derived(boards.current === HOME_BOARD)
  const view = $derived<View>(boards.view(boards.current) ?? { x: width / 2, y: height / 2, zoom: 1 })
  const selected = $derived(new Set(boards.selection))

  /** Cards on or near the screen; the rest aren't drawn, so big boards stay smooth. */
  const shown = $derived.by(() => {
    const margin = 300 / view.zoom
    const area = {
      x: -view.x / view.zoom - margin,
      y: -view.y / view.zoom - margin,
      width: width / view.zoom + 2 * margin,
      height: height / view.zoom + 2 * margin,
    }
    return nodes.filter((n) => intersects(n, area) || selected.has(n.id) || n.id === editingId)
  })
  // From back to front: groups and columns, the cards in columns, arrows, then all other cards, so
  // a loose card is never hidden by a column that grew over it.
  const inColumns = $derived(new Set(nodes.filter(isColumn).flatMap((n) => (n.btCards as string[] | undefined) ?? [])))
  const shownGroups = $derived(shown.filter((n) => n.type === 'group'))
  const shownInColumns = $derived(shown.filter((n) => n.type !== 'group' && inColumns.has(n.id)))
  const shownCards = $derived(shown.filter((n) => n.type !== 'group' && !inColumns.has(n.id)))

  /** This board's canvas theme and pattern. */
  const look = $derived(canvasLookOf(board?.data))
  let canvasOpen = $state(false)

  function setLook(change: Partial<CanvasLook>) {
    boards.update((data) => setCanvasLook(data, change))
  }

  /** The pattern's spacing on screen: 24 board units, doubled as you zoom out so it stays open. */
  const patternStep = $derived(24 * view.zoom * 2 ** Math.max(0, Math.ceil(Math.log2(12 / (24 * view.zoom)))))
  const patternSize = $derived(
    look.pattern === 'graph'
      ? `${patternStep}px ${patternStep}px, ${patternStep}px ${patternStep}px, ${patternStep * 5}px ${patternStep * 5}px, ${patternStep * 5}px ${patternStep * 5}px`
      : `${patternStep}px ${patternStep}px`,
  )

  /** Line thickness for each weight, as a multiple of a medium line. */
  const WEIGHTS: Record<EdgeStyle['weight'], number> = { thin: 0.6, medium: 1, thick: 1.8 }

  /** Arrows keep about the same thickness on screen at any zoom. */
  const lineWidth = $derived(Math.max(2, 1.5 / view.zoom))
  const headSize = $derived(Math.max(14, 9 / view.zoom))

  const arrows = $derived.by(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]))
    return (board?.data.edges ?? []).flatMap((edge) => {
      const from = byId.get(edge.fromNode)
      const to = byId.get(edge.toNode)
      if (!from || !to) return []
      const [fromFacing, toFacing] = facingSides(from, to)
      const style = edgeStyle(edge)
      const ends = { start: style.ends === 'start' || style.ends === 'both', end: style.ends === 'end' || style.ends === 'both' }
      const weight = WEIGHTS[style.weight]
      const width = lineWidth * weight
      const shape = edgeShape(
        from,
        isSide(edge.fromSide) ? edge.fromSide : fromFacing,
        to,
        isSide(edge.toSide) ? edge.toSide : toFacing,
        ends,
        headSize * (0.75 + weight / 4),
        style,
      )
      const dash = style.pattern === 'dashed' ? `${width * 3} ${width * 2.5}` : style.pattern === 'dotted' ? `0.01 ${width * 2.2}` : null
      return [{ edge, shape, color: colorOf(edge.color), width, dash, head: style.head }]
    })
  })

  const preview = $derived.by(() => {
    if (!connecting) return null
    const target = connecting.targetId ? nodes.find((n) => n.id === connecting!.targetId) : null
    const to = target ?? connecting.point
    return edgeShape(connecting.from, connecting.side, to, target ? nearestSide(target, connecting.point) : null, { start: false, end: true }, headSize)
  })


  const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))

  /** Zooms in or out around the middle of the window. */
  function zoomBy(factor: number) {
    const zoom = clampZoom(view.zoom * factor)
    const k = zoom / view.zoom
    boards.setView({ zoom, x: width / 2 - (width / 2 - view.x) * k, y: height / 2 - (height / 2 - view.y) * k })
  }

  /** Centers the window on a point on the board, keeping the zoom. */
  function centerOn(x: number, y: number) {
    boards.setView({ zoom: view.zoom, x: width / 2 - x * view.zoom, y: height / 2 - y * view.zoom })
  }

  function fitView(): View {
    const bounds = boundsOf(nodes)
    if (!bounds || !width || !height) return { x: width / 2, y: height / 2, zoom: 1 }
    const zoom = clampZoom(Math.min(1, (width - 80) / bounds.width, (height - 80) / bounds.height))
    return {
      zoom,
      x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
      y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
    }
  }

  // A board opened for the first time on this device is fitted to the window.
  $effect(() => {
    const path = boards.current
    if (!width || !height || !board) return
    untrack(() => {
      if (!boards.views[path.toLowerCase()]) boards.setView(boards.view(path) ?? fitView(), path)
    })
  })

  $effect(() => {
    void boards.current
    editingId = null
    picker = null
    iconFor = null
    paletteOpen = false
    lineStyleOpen = false
    canvasOpen = false
  })

  // A board card's icon picker belongs to that card; selecting something else closes it.
  $effect(() => {
    void boards.selection
    untrack(() => {
      if (iconFor && iconFor !== boards.current) iconFor = null
    })
  })

  // File → New Note on a board adds a new note card.
  let handledRequest = boards.newNoteRequest
  $effect(() => {
    if (boards.newNoteRequest === handledRequest) return
    handledRequest = boards.newNoteRequest
    untrack(() => addNewNote(''))
  })

  function toBoard(clientX: number, clientY: number): { x: number; y: number } {
    const rect = viewport.getBoundingClientRect()
    return { x: (clientX - rect.left - view.x) / view.zoom, y: (clientY - rect.top - view.y) / view.zoom }
  }

  const center = () => ({ x: (width / 2 - view.x) / view.zoom, y: (height / 2 - view.y) / view.zoom })

  // ---- Adding cards ----

  /**
   * Adds a card near a point, in a free spot. Dragged from the dock it goes exactly where it was
   * dropped instead, and into a column if it was dropped on one.
   */
  function addNode(card: Pick<CanvasNode, 'type' | 'width' | 'height'> & Partial<CanvasNode>, at = center(), exact = false): CanvasNode {
    // Groups and columns are areas to put cards in, not cards to keep clear of.
    const cards = nodes.filter((n) => n.type !== 'group')
    const spot = exact
      ? { x: Math.round(at.x - card.width / 2), y: Math.round(at.y - card.height / 2) }
      : freeSpot(cards, at.x, at.y, card.width, card.height)
    const node = { id: newId(), ...spot, ...card } as CanvasNode
    boards.update((data) => {
      data.nodes.push(node)
      if (exact && node.type !== 'group' && columnAt(data, at)) dropIntoColumn(data, [node.id], at)
    })
    boards.selection = [node.id]
    return node
  }

  function addText(at = center(), text = '', width = 260, exact = false) {
    const lines = text.split('\n').length
    const node = addNode({ type: 'text', text, width, height: Math.min(400, 40 + lines * 20) }, at, exact)
    if (!text) editingId = node.id
    else autosizeId = node.id
  }

  /** Ready-made tables, charts and diagrams to start from; edit the text to make them your own. */
  const TEMPLATES: { label: string; width: number; text: string }[] = [
    {
      label: 'Table',
      width: 380,
      text: '| Task | Owner | Due |\n| --- | --- | --- |\n| Pick tile | | Oct 25 |\n| Call contractor | | |',
    },
    {
      label: 'Pie chart',
      width: 420,
      text: '```mermaid\npie title Budget\n  "Cabinets" : 45\n  "Counters" : 25\n  "Tile" : 15\n  "Labor" : 15\n```',
    },
    {
      label: 'Bar chart',
      width: 460,
      text: '```mermaid\nxychart-beta\n  title "Hours per module"\n  x-axis [Brakes, Engine, Chassis, Electrical]\n  y-axis "Hours" 0 --> 10\n  bar [4, 8, 6, 5]\n```',
    },
    {
      label: 'Line chart',
      width: 460,
      text: '```mermaid\nxychart-beta\n  title "Sign-ups per week"\n  x-axis [W1, W2, W3, W4, W5]\n  y-axis "People" 0 --> 50\n  line [12, 18, 25, 31, 44]\n```',
    },
    {
      label: 'Flowchart',
      width: 480,
      text: '```mermaid\nflowchart LR\n  A[Idea] --> B{Approved?}\n  B -- Yes --> C[Build]\n  B -- No --> D[Revise]\n  D --> A\n```',
    },
    {
      label: 'Timeline',
      width: 520,
      text: '```mermaid\ntimeline\n  title Project X\n  October : Plan : Order tile\n  November : Demolition\n  December : Install\n```',
    },
  ]

  /** Adds a color swatch, starting from one of the card colors, and opens it for editing. */
  function addSwatch(at = center(), exact = false) {
    const palette = Object.values(PRESET_COLORS)
    const used = nodes.filter((n) => kindOf(n) === 'swatch').length
    const color = palette[used % palette.length]
    const node = addNode({ type: 'text', btSwatch: true, color, text: `${color.toUpperCase()}\n${colorName(color)}`, width: 160, height: 200 }, at, exact)
    editingId = node.id
  }

  function addNoteCard(path: string) {
    addNode({ type: 'file', file: path, width: 280, height: 220 })
  }

  function addNewNote(title: string) {
    const note = store.createNote({ title: title || undefined, select: false })
    if (!note) return
    addNoteCard(note.path)
    store.openInPanel(note.id, title ? 2 : 0)
  }

  function addBoardCard(path: string) {
    addNode({ type: 'file', file: path, width: 150, height: 160 })
  }

  function addNewBoard(name: string) {
    addBoardCard(boards.create(name))
  }

  /** A circle to type in, color and connect, like a text card. */
  function addCircle(at = center(), exact = false) {
    const node = addNode({ type: 'text', text: '', styleAttributes: { shape: 'circle' }, width: 160, height: 160 }, at, exact)
    editingId = node.id
  }

  function addColumn(at = center(), exact = false) {
    const node = addNode({ type: 'group', label: '', btColumn: true, btCards: [], width: 300, height: COLUMN.header + COLUMN.empty }, at, exact)
    editingId = node.id
  }

  /**
   * A link card. Its page's title, description, preview image and site name are fetched once and
   * kept on the card (btTitle, btDescription, btImage, btSite), so every device shows the same.
   */
  function addLink(url: string, at = center(), exact = false) {
    const path = boards.current
    const node = addNode({ type: 'link', url, width: 300, height: 110 }, at, exact)
    void window.bt.links.preview(url).then((preview) => {
      if (!preview || !(preview.title || preview.image)) return
      boards.update((data) => {
        const card = data.nodes.find((n) => n.id === node.id)
        if (!card) return
        const fields = { btTitle: preview.title, btDescription: preview.description, btImage: preview.image, btSite: preview.site }
        for (const [key, value] of Object.entries(fields)) if (value) card[key] = value
        // Room for the picture above the text.
        if (preview.image) card.height = Math.max(card.height, 270)
        layoutColumns(data)
      }, path)
    })
  }

  async function imageSize(file: File): Promise<{ width: number; height: number }> {
    try {
      const bitmap = await createImageBitmap(file)
      const size = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return size
    } catch {
      return { width: 4, height: 3 } // A format the window can't decode, such as HEIC.
    }
  }

  /** A video's shape, read from the frame the operating system shows for it. */
  function videoSize(path: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => resolve({ width: 16, height: 9 })
      img.src = `btfile://thumb/${path.split('/').map(encodeURIComponent).join('/')}?w=256`
    })
  }

  /** Copies a file into Attachments/: straight from disk when it has a path, else its bytes. */
  async function attach(file: File, pasted: boolean): Promise<string> {
    const source = window.bt.app.filePath(file)
    if (source) return window.bt.vault.importFile(source)
    return window.bt.vault.addAttachment(attachmentName(file, pasted), new Uint8Array(await file.arrayBuffer()))
  }

  function attachmentName(file: File, pasted: boolean): string {
    if (!pasted && file.name) return file.name
    const pad = (n: number) => String(n).padStart(2, '0')
    const d = new Date()
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}`
    const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
    return `Pasted image ${stamp}.${ext}`
  }

  /** The size a new card for a file starts at. */
  async function cardSize(file: File, path: string): Promise<{ width: number; height: number }> {
    const kind = kindOf({ id: '', type: 'file', file: path, x: 0, y: 0, width: 0, height: 0 })
    if (kind === 'image' || kind === 'video') {
      const size = kind === 'image' ? await imageSize(file) : await videoSize(path)
      return { width: IMAGE_WIDTH, height: Math.round((IMAGE_WIDTH * size.height) / size.width) }
    }
    if (kind === 'pdf') return PDF_SIZE
    return DOC_SIZE
  }

  /** Copies files into Attachments/ and lays their cards out in a row starting at a point. */
  async function addFiles(files: File[], at = center(), pasted = false) {
    if (!files.length) return
    const path = boards.current
    const added: CanvasNode[] = []
    let x = at.x - IMAGE_WIDTH / 2
    for (const file of files) {
      try {
        const rel = await attach(file, pasted)
        const { width, height } = await cardSize(file, rel)
        added.push({ id: newId(), type: 'file', file: rel, x: Math.round(x), y: Math.round(at.y - height / 2), width, height })
        x += width + 20
      } catch (err) {
        boards.error = `Couldn't add ${file.name}: ${(err as Error).message}`
      }
    }
    if (!added.length) return
    boards.update((data) => {
      data.nodes.push(...added)
      // Dropped onto a column: they go into it.
      if (columnAt(data, at)) dropIntoColumn(data, added.map((n) => n.id), at)
    }, path)
    if (boards.current === path) boards.selection = added.map((n) => n.id)
  }

  /** Where the Files tool was dropped, so the chosen files go there. */
  let filesAt: { x: number; y: number } | null = null

  function chooseFiles() {
    const files = [...(imageInput.files ?? [])]
    imageInput.value = ''
    void addFiles(files, filesAt ?? undefined)
    filesAt = null
  }

  // ---- Dragging tools from the dock ----

  const TOOL_NAMES: Record<DockTool, string> = {
    text: 'Text',
    note: 'Note',
    image: 'Files',
    chart: 'Table',
    board: 'Board',
    column: 'Wall',
    color: 'Color',
    shape: 'Circle',
  }

  /** A tool being dragged from the dock; it becomes a drag once the pointer moves a little. */
  let toolDrag = $state<{ tool: DockTool; startX: number; startY: number; x: number; y: number; active: boolean } | null>(null)

  function onToolDown(event: PointerEvent, tool: DockTool) {
    if (event.button !== 0) return
    toolDrag = { tool, startX: event.clientX, startY: event.clientY, x: event.clientX, y: event.clientY, active: false }
  }

  function onToolMove(event: PointerEvent) {
    if (!toolDrag) return
    toolDrag.x = event.clientX
    toolDrag.y = event.clientY
    if (!toolDrag.active && Math.hypot(event.clientX - toolDrag.startX, event.clientY - toolDrag.startY) > 6) {
      toolDrag.active = true
      picker = null
    }
  }

  function onToolUp(event: PointerEvent) {
    const drag = toolDrag
    toolDrag = null
    // A plain click is handled by the button itself.
    if (!drag?.active) return
    const over = document.elementFromPoint(event.clientX, event.clientY)
    if (!over?.closest('.board-viewport') || over.closest('.board-dock, .board-corner')) return
    dropTool(drag.tool, toBoard(event.clientX, event.clientY))
  }

  /** Adds what a dock tool makes, centered where it was dropped. */
  function dropTool(tool: DockTool, at: { x: number; y: number }) {
    switch (tool) {
      case 'text':
        return addText(at, '', 260, true)
      case 'note': {
        const note = store.createNote({ select: false })
        if (!note) return
        addNode({ type: 'file', file: note.path, width: 280, height: 220 }, at, true)
        return store.openInPanel(note.id, 0)
      }
      case 'image':
        filesAt = at
        return imageInput.click()
      case 'chart':
        return addText(at, TEMPLATES[0].text, TEMPLATES[0].width, true)
      case 'board':
        addNode({ type: 'file', file: boards.create('Untitled board'), width: 150, height: 160 }, at, true)
        return
      case 'column':
        return addColumn(at, true)
      case 'color':
        return addSwatch(at, true)
      case 'shape':
        return addCircle(at, true)
    }
  }

  async function openFile(path: string) {
    const message = await window.bt.vault.openFile(path)
    if (message) boards.error = `${path}: ${message}`
  }

  /** Images the window can't show at full size, such as iPhone HEIC photos, open in their app. */
  const viewable = (path: string) => !/\.(heic|heif|tiff?)$/i.test(path)

  // ---- Changing cards ----

  function openCard(node: CanvasNode) {
    const kind = kindOf(node)
    if (kind === 'text' || kind === 'group' || kind === 'column' || kind === 'swatch') editingId = node.id
    else if (kind === 'note' && node.file) {
      const note = store.noteByPath(node.file)
      if (note) store.openInPanel(note.id)
    } else if (kind === 'board' && node.file && boards.get(node.file)) boards.open(node.file)
    else if (kind === 'link' && node.url) window.open(node.url)
    else if ((kind === 'pdf' || kind === 'image') && node.file && viewable(node.file)) viewing = { path: node.file, kind }
    else if (kind === 'image' && node.file) void openFile(node.file)
    // Videos play on the board; double-click opens them in the video player, for full screen or
    // a format the app can't play. Office and other files open in their own app.
    else if ((kind === 'video' || kind === 'file') && node.file) void openFile(node.file)
  }

  function commitText(node: CanvasNode, text: string) {
    editingId = null
    if (kindOf(node) === 'swatch') {
      const [hex, ...name] = text.split('\n')
      const before = swatchOf(node)
      if (hex === before.hex && name.join(' ').trim() === before.name) return
      boards.update(() => setSwatch(node, hex, name.join(' ').trim()))
      return
    }
    if (node.type === 'group') {
      const label = text.trim()
      if (label === (node.label ?? '')) return
      boards.update(() => {
        if (label) node.label = label
        else delete node.label
      })
      return
    }
    // An empty text card is removed; an empty circle is still a shape.
    if (!text.trim() && !isCircle(node)) {
      boards.update((data) => removeNodes(data, new Set([node.id])))
      boards.selection = boards.selection.filter((id) => id !== node.id)
      return
    }
    if (text === node.text) return
    boards.update(() => (node.text = text))
    autosizeId = node.id
  }

  /** Grows a just-edited text card to fit its rendered text, as part of the same undo step. */
  function fitText(node: CanvasNode, needed: number) {
    if (autosizeId !== node.id) return
    autosizeId = null
    // A circle stays round; it's resized by hand.
    if (isCircle(node)) return
    if (needed > node.height) {
      boards.mutate((data) => {
        node.height = Math.ceil(needed)
        layoutColumns(data)
      })
    }
  }

  /** The board a single selected board card links to, whose icon the toolbar can change. */
  /** Whether the full color palette is open, from "More colors" in the toolbar. */
  let paletteOpen = $state(false)

  /** The color the selected cards and arrows share, if they all have the same one. */
  const selectionColor = $derived.by(() => {
    const items = [...nodes, ...(board?.data.edges ?? [])].filter((item) => selected.has(item.id))
    const colors = new Set(items.map((item) => colorOf(item.color)?.toLowerCase() ?? null))
    return colors.size === 1 ? [...colors][0] : undefined
  })

  /** Selected arrows, whose line style the Line picker shows and changes. */
  const selectedEdges = $derived((board?.data.edges ?? []).filter((e) => selected.has(e.id)))
  let lineStyleOpen = $state(false)

  function setLineStyle(change: Partial<EdgeStyle>) {
    boards.update((data) => {
      for (const edge of data.edges) if (selected.has(edge.id)) setEdgeStyle(edge, change)
    })
  }

  const selectedBoard = $derived.by(() => {
    if (selected.size !== 1) return null
    const node = nodes.find((n) => selected.has(n.id))
    return node && kindOf(node) === 'board' && node.file && boards.get(node.file) ? node.file : null
  })

  async function setIconImage(path: string, file: File) {
    try {
      const image = await attach(file, false)
      boards.setIcon(path, { ...boardIconOf(boards.get(path)?.data), image })
    } catch (err) {
      boards.error = `Couldn't use ${file.name}: ${(err as Error).message}`
    }
  }

  function deleteSelection() {
    if (!selected.size) return
    const ids = new Set(selected)
    boards.update((data) => {
      removeNodes(data, ids)
      data.edges = data.edges.filter((e) => !ids.has(e.id))
    })
    boards.selection = []
  }

  function setColor(color: string | null) {
    boards.update((data) => {
      for (const item of [...data.nodes, ...data.edges]) {
        if (!selected.has(item.id)) continue
        // A swatch is its color: a card color becomes its new color, and it can't have none.
        if ('type' in item && kindOf(item as CanvasNode) === 'swatch') {
          const hex = colorOf(color ?? undefined)
          const before = swatchOf(item as CanvasNode)
          if (hex) setSwatch(item as CanvasNode, hex, swatchNameAfter(before.hex, before.name, hex))
          continue
        }
        if (color) item.color = color
        else delete item.color
      }
    })
  }

  // ---- Pointer gestures ----

  function startPan(event: PointerEvent) {
    gesture = { kind: 'pan', startX: event.clientX, startY: event.clientY, from: view }
  }

  function onBackgroundDown(event: PointerEvent) {
    if (event.button === 1 || (event.button === 0 && !(event.target as Element).closest('.card'))) {
      if (event.button === 0 && !event.shiftKey) boards.selection = []
      startPan(event)
    }
  }

  function onCardDown(event: PointerEvent, node: CanvasNode) {
    if (event.button === 1) return startPan(event)
    if (event.button !== 0 || node.id === editingId) return
    event.stopPropagation()
    const wasSelected = selected.has(node.id)
    if (event.shiftKey) {
      boards.selection = wasSelected ? boards.selection.filter((id) => id !== node.id) : [...boards.selection, node.id]
      if (wasSelected) return
    } else if (!wasSelected) {
      boards.selection = [node.id]
    }
    // Moving a group or column moves the cards inside it.
    const moving = nodes.filter((n) => boards.selection.includes(n.id))
    const carried = new Set<string>()
    for (const group of moving.filter((n) => n.type === 'group')) {
      const inside = isColumn(group) && board ? columnCards(board.data, group) : nodes.filter((n) => n !== group && contains(group, n))
      for (const n of inside) carried.add(n.id)
    }
    for (const n of nodes) if (carried.has(n.id) && !moving.includes(n)) moving.push(n)
    gesture = {
      kind: 'move',
      startX: event.clientX,
      startY: event.clientY,
      origins: moving.map((n) => ({ node: n, x: n.x, y: n.y })),
      moved: false,
      clickedId: node.id,
      collapseTo: wasSelected && !event.shiftKey && boards.selection.length > 1,
      loose: moving.filter((n) => n.type !== 'group' && !carried.has(n.id)).map((n) => n.id),
      copy: event.altKey,
    }
    // Keeps Windows from opening the menu bar when Alt is let go after an Alt+drag.
    if (event.altKey) event.preventDefault()
  }

  /** Alt+drag: copies the cards being dragged, and the drag carries on with the copies. */
  function startCopy(g: Extract<Gesture, { kind: 'move' }>) {
    if (!board) return
    const data = board.data
    const copied = duplicate(
      $state.snapshot(data) as typeof data,
      g.origins.map((o) => $state.snapshot(o.node) as CanvasNode),
    )
    boards.mutate((d) => {
      d.nodes.push(...copied.nodes)
      d.edges.push(...copied.edges)
    })
    // The copies as they are on the board now, so moving them updates what's drawn.
    const live = new Map(data.nodes.map((n) => [n.id, n]))
    g.origins = g.origins.map((o) => ({ ...o, node: live.get(copied.ids.get(o.node.id)!)! }))
    g.loose = g.loose.map((id) => copied.ids.get(id)!)
    g.clickedId = copied.ids.get(g.clickedId) ?? g.clickedId
    boards.selection = boards.selection.flatMap((id) => copied.ids.get(id) ?? [])
  }

  function onConnectDown(event: PointerEvent, node: CanvasNode, side: Side) {
    if (event.button !== 0) return
    event.stopPropagation()
    gesture = { kind: 'connect', startX: event.clientX, startY: event.clientY }
    connecting = { from: node, side, point: toBoard(event.clientX, event.clientY), targetId: null }
    viewport.setPointerCapture(event.pointerId)
  }

  /** The card under a point on screen, other than the given one. */
  function cardAt(clientX: number, clientY: number, except: string): CanvasNode | null {
    const id = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('.card')?.dataset.id
    return id && id !== except ? (nodes.find((n) => n.id === id) ?? null) : null
  }

  function onEdgeDown(event: PointerEvent, edge: CanvasEdge) {
    if (event.button === 1) return startPan(event)
    if (event.button !== 0) return
    event.stopPropagation()
    if (event.shiftKey) {
      boards.selection = selected.has(edge.id) ? boards.selection.filter((id) => id !== edge.id) : [...boards.selection, edge.id]
    } else {
      boards.selection = [edge.id]
    }
  }

  function commitLabel(edge: CanvasEdge, event: Event) {
    // Switching to another window also takes focus away; keep editing until the user comes back.
    if (!document.hasFocus()) return
    editingId = null
    const label = (event.currentTarget as HTMLInputElement).value.trim()
    if (label === (edge.label ?? '')) return
    boards.update((data) => {
      const target = data.edges.find((e) => e.id === edge.id)
      if (!target) return
      if (label) target.label = label
      else delete target.label
    })
  }

  const focusOnMount = (input: HTMLInputElement) => {
    input.focus()
    input.select()
  }

  function onResizeDown(event: PointerEvent, node: CanvasNode) {
    if (event.button !== 0) return
    event.stopPropagation()
    gesture = {
      kind: 'resize',
      startX: event.clientX,
      startY: event.clientY,
      node,
      width: node.width,
      height: node.height,
      // Images keep their shape.
      ratio: keepsShape(node) ? node.height / node.width : null,
      ratios: new Map(
        isColumn(node) && board
          ? columnCards(board.data, node)
              .filter((n) => keepsShape(n) && n.width > 0)
              .map((n) => [n.id, n.height / n.width])
          : [],
      ),
      moved: false,
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (!gesture) return
    // The button was released where the board couldn't see it, for example over the toolbar.
    if (event.buttons === 0) {
      gesture = null
      connecting = null
      dropColumnId = null
      tagUnder?.classList.remove('drop-target')
      tagUnder = null
      return
    }
    const dx = event.clientX - gesture.startX
    const dy = event.clientY - gesture.startY
    // The pointer is captured only once a drag starts: while it's captured, Chrome sends clicks
    // and double-clicks to the board instead of the card under the pointer.
    const capture = () => viewport.hasPointerCapture(event.pointerId) || viewport.setPointerCapture(event.pointerId)
    if (gesture.kind === 'pan') {
      capture()
      boards.setView({ ...gesture.from, x: gesture.from.x + dx, y: gesture.from.y + dy })
      return
    }
    if (gesture.kind === 'connect') {
      if (connecting) {
        connecting.point = toBoard(event.clientX, event.clientY)
        connecting.targetId = cardAt(event.clientX, event.clientY, connecting.from.id)?.id ?? null
      }
      return
    }
    if (!gesture.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
      gesture.moved = true
      capture()
      boards.checkpoint()
      if (gesture.kind === 'move' && gesture.copy) startCopy(gesture)
    }
    const g = gesture
    if (g.kind === 'move') {
      boards.mutate(() => {
        for (const o of g.origins) {
          o.node.x = Math.round(o.x + dx / view.zoom)
          o.node.y = Math.round(o.y + dy / view.zoom)
        }
      })
      trackTagUnder(event, g)
      if (g.loose.length && board) {
        const columns = new Set(g.origins.filter((o) => isColumn(o.node)).map((o) => o.node.id))
        dropColumnId = columnAt(board.data, toBoard(event.clientX, event.clientY), columns)?.id ?? null
      }
    } else {
      const w = Math.max(60, Math.round(g.width + dx / view.zoom))
      boards.mutate((data) => {
        g.node.width = w
        // A column's height follows its cards.
        if (isColumn(g.node)) layoutColumns(data, g.ratios)
        else g.node.height = g.ratio ? Math.round(w * g.ratio) : Math.max(40, Math.round(g.height + dy / view.zoom))
      })
    }
  }

  /**
   * The sidebar tag under the pointer while note cards are dragged, if any. Dropped there, the
   * notes get the tag and the cards go back to where they were.
   */
  let tagUnder: HTMLElement | null = null

  function noteCardsIn(g: Extract<Gesture, { kind: 'move' }>): string[] {
    return g.origins.flatMap((o) => (kindOf(o.node) === 'note' && o.node.file ? [o.node.file] : []))
  }

  function trackTagUnder(event: PointerEvent, g: Extract<Gesture, { kind: 'move' }>) {
    const el = noteCardsIn(g).length ? document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-tag]') : null
    if (el === tagUnder) return
    tagUnder?.classList.remove('drop-target')
    tagUnder = el ?? null
    tagUnder?.classList.add('drop-target')
  }

  function onPointerUp(event: PointerEvent) {
    const g = gesture
    // Note cards dropped on a sidebar tag: tag the notes and put the cards back.
    if (g?.kind === 'move' && g.moved && tagUnder?.dataset.tag) {
      const tag = tagUnder.dataset.tag
      for (const path of noteCardsIn(g)) store.tagNoteAt(path, tag)
      boards.revert()
      tagUnder.classList.remove('drop-target')
      tagUnder = null
      gesture = null
      if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
      return
    }
    // A click on one of several selected cards selects just that card.
    if (g?.kind === 'move' && !g.moved && g.collapseTo) boards.selection = [g.clickedId]
    // Dropped cards go into the column under the pointer, or out of the one they were in.
    if (g?.kind === 'move' && g.moved) {
      const point = toBoard(event.clientX, event.clientY)
      boards.mutate((data) => {
        bringToFront(data, new Set(g.origins.map((o) => o.node.id)))
        const columns = new Set(g.origins.filter((o) => isColumn(o.node)).map((o) => o.node.id))
        if (g.loose.length) dropIntoColumn(data, g.loose, point, columns)
        else layoutColumns(data)
      })
    }
    // A resized card in a column gets the column's width back.
    if (g?.kind === 'resize' && g.moved) boards.mutate(layoutColumns)
    if (g?.kind === 'connect' && connecting?.targetId) {
      const { from, side, point, targetId } = connecting
      const target = nodes.find((n) => n.id === targetId)!
      const edge: CanvasEdge = { id: newId(), fromNode: from.id, fromSide: side, toNode: targetId, toSide: nearestSide(target, point) }
      boards.update((data) => data.edges.push(edge))
      boards.selection = [edge.id]
    }
    connecting = null
    dropColumnId = null
    gesture = null
    if (viewport.hasPointerCapture(event.pointerId)) viewport.releasePointerCapture(event.pointerId)
  }

  function onBackgroundDoubleClick(event: MouseEvent) {
    if ((event.target as Element).closest('.card')) return
    addText(toBoard(event.clientX, event.clientY))
  }

  // Wheel scrolls the board; Ctrl+wheel (and pinching on a trackpad) zooms around the pointer.
  // Added by hand because it must be able to cancel the browser's own scrolling.
  $effect(() => {
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const lines = event.deltaMode === 1 ? 20 : 1
      if (event.ctrlKey || event.metaKey) {
        const rect = viewport.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top
        const zoom = clampZoom(view.zoom * Math.exp(-event.deltaY * lines * 0.002))
        const k = zoom / view.zoom
        boards.setView({ zoom, x: px - (px - view.x) * k, y: py - (py - view.y) * k })
      } else {
        const dx = (event.shiftKey ? event.deltaY : event.deltaX) * lines
        const dy = (event.shiftKey ? 0 : event.deltaY) * lines
        boards.setView({ ...view, x: view.x - dx, y: view.y - dy })
      }
    }
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', onWheel)
  })

  // ---- Keyboard, paste and drop ----

  const isEditable = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))

  function onKeyDown(event: KeyboardEvent) {
    if (iconFor) return
    if ((paletteOpen || lineStyleOpen || canvasOpen) && event.key === 'Escape') {
      paletteOpen = false
      lineStyleOpen = false
      canvasOpen = false
      event.preventDefault()
      return
    }
    if (viewing && event.key === 'Escape') {
      viewing = null
      event.preventDefault()
      return
    }
    if (isEditable(event.target) || picker || viewing) return
    const mod = event.ctrlKey || event.metaKey
    if (event.key === 'Delete' || event.key === 'Backspace') deleteSelection()
    else if (event.key === 'Escape') boards.selection = []
    else if (mod && event.key.toLowerCase() === 'z') {
      autosizeId = null
      if (event.shiftKey) boards.redo()
      else boards.undo()
    } else if (mod && event.key.toLowerCase() === 'y') {
      autosizeId = null
      boards.redo()
    }
    else if (mod && event.key.toLowerCase() === 'a') boards.selection = nodes.map((n) => n.id)
    else return
    event.preventDefault()
  }

  function onPaste(event: ClipboardEvent) {
    if (isEditable(event.target) || !event.clipboardData) return
    const files = [...event.clipboardData.files]
    const text = event.clipboardData.getData('text/plain').trim()
    if (files.length) void addFiles(files, center(), true)
    else if (/^https?:\/\/\S+$/.test(text)) addLink(text)
    else if (text) addText(center(), text)
    else return
    event.preventDefault()
  }

  const hasFiles = (event: DragEvent) => event.dataTransfer?.types.includes('Files') ?? false

  /** A link dragged in from a browser's address bar or a page. */
  const hasLink = (event: DragEvent) => event.dataTransfer?.types.includes('text/uri-list') ?? false

  function onDragOver(event: DragEvent) {
    if (!hasFiles(event) && !hasLink(event)) return
    event.preventDefault()
    dropping = true
  }

  function onDrop(event: DragEvent) {
    dropping = false
    if (hasFiles(event)) {
      event.preventDefault()
      void addFiles([...(event.dataTransfer?.files ?? [])], toBoard(event.clientX, event.clientY))
      return
    }
    // A uri-list has one address per line; lines starting with # are comments.
    const url = event.dataTransfer
      ?.getData('text/uri-list')
      .split(/\r?\n/)
      .find((line) => /^https?:\/\//i.test(line.trim()))
    if (!url) return
    event.preventDefault()
    addLink(url.trim(), toBoard(event.clientX, event.clientY), true)
  }

  function renameBoard(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const name = input.value.trim()
    if (name && board) boards.rename(board.path, name)
    else input.value = boardName(boards.current)
  }
</script>

<svelte:window
  onpointermove={onToolMove}
  onpointerup={onToolUp}
  onkeydown={onKeyDown}
  onpaste={onPaste}
  onpointerdown={(e) => {
    // A click anywhere else closes the icon picker or the palette, so the board's keys work again.
    if (iconFor && !(e.target as Element).closest('.icon-picker-anchor, .icon-toggle')) iconFor = null
    if (paletteOpen && !(e.target as Element).closest('.palette-anchor, .palette-toggle')) paletteOpen = false
    if (lineStyleOpen && !(e.target as Element).closest('.line-style-anchor, .line-style-toggle')) lineStyleOpen = false
    if (canvasOpen && !(e.target as Element).closest('.canvas-anchor, .canvas-toggle')) canvasOpen = false
  }}
/>

{#snippet iconPicker(path: string, side: 'left' | 'right')}
  <div class="icon-picker-anchor {side}">
    <BoardIconPicker
      icon={boardIconOf(boards.get(path)?.data)}
      onchange={(icon) => boards.setIcon(path, icon)}
      onimage={(file) => setIconImage(path, file)}
      onclose={() => (iconFor = null)}
    />
  </div>
{/snippet}

<main class="board-pane" data-canvas={look.theme === 'system' ? undefined : look.theme}>
  <header class="board-toolbar">
    <button
      class="icon-button"
      class:on={store.sidebarHidden}
      title={store.sidebarHidden ? 'Show sidebar (Ctrl+\\)' : 'Hide sidebar (Ctrl+\\)'}
      onclick={() => store.toggleSidebar()}><Icon name="sidebar" /></button
    >
    {#if boards.canGoBack}
      <button class="icon-button" title="Back" onclick={() => boards.back()}><Icon name="back" /></button>
    {/if}
    <div class="insert">
      <button class="title-icon icon-toggle" title="Change this board's icon" aria-expanded={iconFor === boards.current} onclick={() => (iconFor = iconFor === boards.current ? null : boards.current)}>
        <BoardTile icon={boardIconOf(board?.data)} size={16} />
      </button>
      {#if iconFor && iconFor === boards.current}
        {@render iconPicker(iconFor, 'left')}
      {/if}
    </div>
    {#if isHome}
      <h1 class="board-title">Home</h1>
    {:else}
      {#key boards.current}
        <input
          class="board-title"
          value={boardName(boards.current)}
          aria-label="Board name"
          spellcheck="false"
          onchange={renameBoard}
          onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
      {/key}
    {/if}
    <span class="spacer"></span>
    <div class="insert">
      <button class="text-button canvas-toggle" title="Canvas theme and pattern" aria-expanded={canvasOpen} onclick={() => (canvasOpen = !canvasOpen)}>
        <Icon name="canvas" /> <span class="button-label">Canvas</span>
      </button>
      {#if canvasOpen}
        <div class="picker canvas-anchor">
          <CanvasPicker value={look} onchange={setLook} />
        </div>
      {/if}
    </div>
    {#if selected.size}
      <div class="swatches" role="group" aria-label="Card color">
        <button class="swatch swatch-none" title="No color" aria-label="No color" onclick={() => setColor(null)}></button>
        {#each Object.entries(PRESET_COLORS) as [id, color] (id)}
          <button class="swatch" style:background={color} title="Color {id}" aria-label="Color {id}" onclick={() => setColor(id)}></button>
        {/each}
        <div class="insert">
          <button
            class="swatch swatch-more palette-toggle"
            title="More colors"
            aria-label="More colors"
            aria-expanded={paletteOpen}
            onclick={() => (paletteOpen = !paletteOpen)}
          ></button>
          {#if paletteOpen}
            <div class="picker palette-anchor">
              <ColorPalette
                value={selectionColor}
                onpick={(color) => {
                  setColor(color)
                  paletteOpen = false
                }}
              />
            </div>
          {/if}
        </div>
      </div>
      {#if selectedEdges.length}
        <div class="insert">
          <button
            class="text-button line-style-toggle"
            title="Line style: shape, pattern, thickness and arrowheads"
            aria-expanded={lineStyleOpen}
            onclick={() => (lineStyleOpen = !lineStyleOpen)}
          >
            <Icon name="spline" /> <span class="button-label">Line</span>
          </button>
          {#if lineStyleOpen}
            <div class="picker line-style-anchor">
              <LineStylePicker value={edgeStyle(selectedEdges[0])} onchange={setLineStyle} />
            </div>
          {/if}
        </div>
      {/if}
      {#if selectedBoard}
        <div class="insert">
          <button class="text-button icon-toggle" title="Change this board's icon" aria-expanded={iconFor === selectedBoard} onclick={() => (iconFor = iconFor === selectedBoard ? null : selectedBoard)}>
            <Icon name="board" /> <span class="button-label">Icon</span>
          </button>
          {#if iconFor && iconFor === selectedBoard}
            {@render iconPicker(iconFor, 'right')}
          {/if}
        </div>
      {/if}
      <button class="icon-button" title="Delete selected (Del)" onclick={deleteSelection}><Icon name="trash" /></button>
    {:else if !isHome}
      <button class="icon-button" title="Move board to Trash" onclick={() => boards.trash(boards.current)}><Icon name="trash" /></button>
    {/if}
  </header>

  <div
    class="board-viewport pattern-{look.pattern}"
    class:dropping
    style:background-size={look.pattern === 'none' ? undefined : patternSize}
    style:background-position={look.pattern === 'none' ? undefined : `${view.x}px ${view.y}px`}
    bind:this={viewport}
    bind:clientWidth={width}
    bind:clientHeight={height}
    onpointerdown={onBackgroundDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    ondblclick={onBackgroundDoubleClick}
    ondragover={onDragOver}
    ondragleave={() => (dropping = false)}
    ondrop={onDrop}
    style:--zoom={view.zoom}
    role="application"
    aria-label="Board"
  >
    {#snippet card(node: CanvasNode)}
      <BoardCard
        {node}
        zoom={view.zoom}
        selected={selected.has(node.id)}
        editing={editingId === node.id}
        dropTarget={dropColumnId === node.id}
        linkTarget={connecting?.targetId === node.id}
        inColumn={inColumns.has(node.id)}
        onpointerdown={(e) => onCardDown(e, node)}
        onresizestart={(e) => onResizeDown(e, node)}
        onconnectstart={(e, side) => onConnectDown(e, node, side)}
        onopen={() => openCard(node)}
        autosize={autosizeId === node.id}
        oncommit={(text) => commitText(node, text)}
        onautosize={(h) => fitText(node, h)}
      />
    {/snippet}
    <div class="board-world" class:connecting={!!connecting} style:transform="translate({view.x}px, {view.y}px) scale({view.zoom})">
      {#each shownGroups as node (node.id)}{@render card(node)}{/each}
      {#each shownInColumns as node (node.id)}{@render card(node)}{/each}
      <svg class="board-arrows" width="1" height="1" aria-hidden="true">
        {#each arrows as { edge, shape, color, width, dash, head } (edge.id)}
          <g class="arrow" class:selected={selected.has(edge.id)} style:--arrow-color={color}>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <path
              class="arrow-hit"
              d={shape.d}
              stroke-width={width + 12 / view.zoom}
              onpointerdown={(e) => onEdgeDown(e, edge)}
              ondblclick={(e) => {
                e.stopPropagation()
                editingId = edge.id
              }}
            />
            <path class="arrow-line" d={shape.d} stroke-width={width} stroke-dasharray={dash} />
            {#if shape.startHead}<path class="arrow-head head-{head}" d={shape.startHead} stroke-width={width} />{/if}
            {#if shape.endHead}<path class="arrow-head head-{head}" d={shape.endHead} stroke-width={width} />{/if}
          </g>
        {/each}
        {#if preview}
          <g class="arrow preview">
            <path class="arrow-line" d={preview.d} stroke-width={lineWidth} />
            <path class="arrow-head" d={preview.endHead} />
          </g>
        {/if}
      </svg>
      {#each arrows as { edge, shape } (edge.id)}
        {#if editingId === edge.id}
          <input
            class="arrow-label"
            style:left="{shape.mid.x}px"
            style:top="{shape.mid.y}px"
            value={edge.label ?? ''}
            placeholder="Label"
            {@attach focusOnMount}
            onblur={(e) => commitLabel(edge, e)}
            onkeydown={(e) => (e.key === 'Enter' || e.key === 'Escape') && e.currentTarget.blur()}
            onpointerdown={(e) => e.stopPropagation()}
            ondblclick={(e) => e.stopPropagation()}
          />
        {:else if edge.label}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="arrow-label"
            class:selected={selected.has(edge.id)}
            style:left="{shape.mid.x}px"
            style:top="{shape.mid.y}px"
            onpointerdown={(e) => onEdgeDown(e, edge)}
            ondblclick={(e) => {
              e.stopPropagation()
              editingId = edge.id
            }}
          >
            {edge.label}
          </div>
        {/if}
      {/each}
      {#each shownCards as node (node.id)}{@render card(node)}{/each}
    </div>
    {#if !nodes.length}
      <p class="board-empty">Double-click to add text, or drop images, PDFs, videos and documents here.<br />Use the toolbar at the bottom to add notes, boards and walls.</p>
    {/if}
  </div>

  <!-- Click a tool to add it in the middle of the window, or drag it to where it should go. -->
  <div class="board-dock" class:dragging={toolDrag?.active} role="toolbar" aria-label="Add to board">
    <button class="dock-button" data-tip="Text" aria-label="Text: click, or drag onto the board" onpointerdown={(e) => onToolDown(e, 'text')} onclick={() => addText()}>
      <DockIcon tool="text" />
    </button>
    <div class="insert">
      <button
        class="dock-button"
        data-tip="Note" aria-label="Note: click to pick one, or drag to add a new one"
        aria-expanded={picker === 'note'}
        onpointerdown={(e) => onToolDown(e, 'note')}
        onclick={() => (picker = picker === 'note' ? null : 'note')}
      >
        <DockIcon tool="note" />
      </button>
      {#if picker === 'note'}
        <CardPicker kind="note" onnote={addNoteCard} onnewnote={addNewNote} onboard={addBoardCard} onnewboard={addNewBoard} onclose={() => (picker = null)} />
      {/if}
    </div>
    <button
      class="dock-button"
      data-tip="Images and files" aria-label="Images, PDFs, videos or documents: click, drag onto the board, or drop files in"
      onpointerdown={(e) => onToolDown(e, 'image')}
      onclick={() => imageInput.click()}
    >
      <DockIcon tool="image" />
    </button>
    <div class="insert">
      <button
        class="dock-button"
        data-tip="Table, chart or diagram" aria-label="Table, chart or diagram: click to pick one, or drag to add a table"
        aria-expanded={picker === 'chart'}
        onpointerdown={(e) => onToolDown(e, 'chart')}
        onclick={() => (picker = picker === 'chart' ? null : 'chart')}
      >
        <DockIcon tool="chart" />
      </button>
      {#if picker === 'chart'}
        <div class="menu chart-menu" role="menu">
          {#each TEMPLATES as template (template.label)}
            <button
              role="menuitem"
              onclick={() => {
                picker = null
                addText(center(), template.text, template.width)
              }}>{template.label}</button
            >
          {/each}
        </div>
      {/if}
    </div>
    <span class="dock-divider"></span>
    <div class="insert">
      <button
        class="dock-button"
        data-tip="Board" aria-label="Board: click to pick one, or drag to add a new one"
        aria-expanded={picker === 'board'}
        onpointerdown={(e) => onToolDown(e, 'board')}
        onclick={() => (picker = picker === 'board' ? null : 'board')}
      >
        <DockIcon tool="board" />
      </button>
      {#if picker === 'board'}
        <CardPicker kind="board" onnote={addNoteCard} onnewnote={addNewNote} onboard={addBoardCard} onnewboard={addNewBoard} onclose={() => (picker = null)} />
      {/if}
    </div>
    <button
      class="dock-button"
      data-tip="Wall" aria-label="Wall: cards dragged onto it stack top to bottom. Click, or drag onto the board"
      onpointerdown={(e) => onToolDown(e, 'column')}
      onclick={() => addColumn()}
    >
      <DockIcon tool="column" />
    </button>
    <span class="dock-divider"></span>
    <button class="dock-button" data-tip="Color swatch" aria-label="Color swatch: click, or drag onto the board" onpointerdown={(e) => onToolDown(e, 'color')} onclick={() => addSwatch()}>
      <DockIcon tool="color" />
    </button>
    <div class="insert">
      <button
        class="dock-button"
        data-tip="Shape" aria-label="Shape: click to pick one, or drag to add a circle"
        aria-expanded={picker === 'shape'}
        onpointerdown={(e) => onToolDown(e, 'shape')}
        onclick={() => (picker = picker === 'shape' ? null : 'shape')}
      >
        <DockIcon tool="shape" />
      </button>
      {#if picker === 'shape'}
        <div class="menu chart-menu" role="menu">
          <button
            role="menuitem"
            onclick={() => {
              picker = null
              addCircle()
            }}>Circle</button
          >
        </div>
      {/if}
    </div>
    <input class="hidden-input" type="file" multiple bind:this={imageInput} onchange={chooseFiles} />
  </div>

  {#if toolDrag?.active}
    <div class="tool-ghost" style:left="{toolDrag.x}px" style:top="{toolDrag.y}px" aria-hidden="true">
      <DockIcon tool={toolDrag.tool} size={44} />
      <span>{TOOL_NAMES[toolDrag.tool]}</span>
    </div>
  {/if}

  <div class="board-corner">
    {#if nodes.length}
      <Minimap {nodes} {view} {width} {height} onjump={centerOn} />
    {/if}
    <div class="zoom-controls">
      <button class="icon-button" title="Zoom out" onclick={() => zoomBy(1 / 1.25)}><Icon name="minus" /></button>
      <button class="zoom-level" title="Fit board to window" onclick={() => boards.setView(fitView())}>{Math.round(view.zoom * 100)}%</button>
      <button class="icon-button" title="Zoom in" onclick={() => zoomBy(1.25)}><Icon name="plus" /></button>
      <button class="icon-button" title="Fit board to window" onclick={() => boards.setView(fitView())}><Icon name="fit" /></button>
      <span class="toolbar-divider"></span>
      <button class="icon-button" title="Undo (Ctrl+Z)" onclick={() => boards.undo()}><Icon name="undo" /></button>
      <button class="icon-button" title="Redo (Ctrl+Shift+Z)" onclick={() => boards.redo()}><Icon name="redo" /></button>
    </div>
  </div>

  {#if viewing}
    {@const url = `btfile://file/${viewing.path.split('/').map(encodeURIComponent).join('/')}`}
    <div class="viewer" role="dialog" aria-label={viewing.path}>
      <header class="viewer-bar">
        <span class="viewer-title">{viewing.path.slice(viewing.path.lastIndexOf('/') + 1)}</span>
        <span class="spacer"></span>
        <button class="text-button" onclick={() => viewing && openFile(viewing.path)}>Open in its app</button>
        <button class="icon-button" title="Close (Esc)" onclick={() => (viewing = null)}><Icon name="close" /></button>
      </header>
      {#if viewing.kind === 'pdf'}
        <iframe class="viewer-frame" src={url} title={viewing.path}></iframe>
      {:else}
        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <div class="viewer-image" onclick={() => (viewing = null)} role="presentation">
          <img src={url} alt={viewing.path} />
        </div>
      {/if}
    </div>
  {/if}
</main>

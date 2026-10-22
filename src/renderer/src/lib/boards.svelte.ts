import type { NoteFile, PendingSave, VaultEvent } from '../../../shared/types'
import {
  boardName,
  BOARD_EXT,
  BOARDS_DIR,
  emptyBoard,
  HOME_BOARD,
  pathFromHome,
  parentChain,
  layoutColumns,
  parseBoard,
  renameFile,
  serializeBoard,
  type CanvasData,
} from './board'
import type { BoardIcon } from './boardIcons'
import { fileNameFor } from './note'

export interface Board {
  path: string
  data: CanvasData
}

/** Pan offset in screen pixels and zoom factor. A board point p shows at p * zoom + (x, y). */
export interface View {
  x: number
  y: number
  zoom: number
}

const SAVE_DELAY_MS = 600
const HISTORY_LIMIT = 100
const VIEW_KEY = 'bt-board-view:'

const { vault } = window.bt
const key = (path: string) => path.toLowerCase()

/** Remembered pan and zoom are a convenience for this device only, so failures are ignored. */
function readView(root: string, path: string): View | null {
  try {
    const raw = localStorage.getItem(`${VIEW_KEY}${root}|${key(path)}`)
    return raw ? (JSON.parse(raw) as View) : null
  } catch {
    return null
  }
}

const RECENT_KEY = 'bt-recent-boards:'
/** How many recently opened folders the sidebar shows. */
const RECENT_SHOWN = 5

/** Recently opened folders, newest first; per device, like remembered views. */
function readRecent(root: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(`${RECENT_KEY}${root}`) ?? '[]')
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : []
  } catch {
    return []
  }
}

function writeRecent(root: string, paths: string[]): void {
  try {
    localStorage.setItem(`${RECENT_KEY}${root}`, JSON.stringify(paths))
  } catch {
    // Storage full or unavailable.
  }
}

function writeView(root: string, path: string, view: View): void {
  try {
    localStorage.setItem(`${VIEW_KEY}${root}|${key(path)}`, JSON.stringify(view))
  } catch {
    // Storage full or unavailable.
  }
}

class BoardsStore {
  /** Every board in the folder by lower-cased path, plus Home even before its file exists. */
  boards = $state<Record<string, Board>>({})
  current = $state(HOME_BOARD)
  selection = $state<string[]>([])
  views = $state<Record<string, View>>({})
  error = $state<string | null>(null)
  /** Bumped when File → New Note is chosen on a board; the board adds the new note as a card. */
  newNoteRequest = $state(0)

  private root = ''
  /** Boards opened before the current one, for the back button. */
  private trail: string[] = []
  private undoStack = new Map<string, CanvasData[]>()
  private redoStack = new Map<string, CanvasData[]>()
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Saves sent to storage that haven't finished, by lower-cased path. */
  private inFlight = new Map<string, number>()
  /**
   * Board files that couldn't be read, such as ones with a typo from a hand edit. Their names
   * count as taken and Home can't be changed while it's one of them, so they're never overwritten.
   */
  private unreadable = new Set<string>()
  private viewTimer: ReturnType<typeof setTimeout> | undefined
  canGoBack = $state(false)
  /** Folders opened on this device, newest first. */
  recent = $state<string[]>([])

  list = $derived(
    Object.values(this.boards).sort((a, b) =>
      a.path === HOME_BOARD ? -1 : b.path === HOME_BOARD ? 1 : boardName(a.path).localeCompare(boardName(b.path)),
    ),
  )

  board = $derived(this.boards[key(this.current)] ?? null)

  /** Starred folders for the sidebar, by name. The star is kept in each folder's own file. */
  favorites = $derived(this.list.filter((b) => b.path !== HOME_BOARD && b.data.btFavorite === true))

  /** The last few folders opened on this device, newest first, without Home or Favorites, which are listed already. */
  recentList = $derived(
    this.recent
      .filter((p) => key(p) !== key(HOME_BOARD))
      .map((p) => this.boards[key(p)])
      .filter((b): b is Board => !!b && b.data.btFavorite !== true)
      .slice(0, RECENT_SHOWN),
  )

  /** The way down from Home to the open folder, through folder cards; else the folders above it. */
  route = $derived(pathFromHome(Object.values(this.boards), this.current) ?? parentChain(Object.values(this.boards), this.current))

  get(path: string): Board | null {
    return this.boards[key(path)] ?? null
  }

  /** Loads the boards of a notes folder; `root` keeps each folder's remembered views apart. */
  load(files: NoteFile[], root: string): void {
    this.root = root
    this.views = {}
    this.boards = {}
    this.unreadable.clear()
    this.undoStack.clear()
    this.redoStack.clear()
    for (const file of files) this.addFile(file)
    this.ensureHome()
    this.trail = []
    this.canGoBack = false
    this.current = HOME_BOARD
    this.selection = []
    this.recent = readRecent(root)
  }

  private ensureHome(): void {
    if (!this.boards[key(HOME_BOARD)]) this.boards[key(HOME_BOARD)] = { path: HOME_BOARD, data: emptyBoard() }
  }

  private addFile(file: NoteFile): void {
    const data = parseBoard(file.content)
    if (!data) {
      this.unreadable.add(key(file.path))
      this.error = `Couldn't read the board ${file.path}. It's left as it is; fix or remove it to use that name.`
      return
    }
    this.unreadable.delete(key(file.path))
    this.boards[key(file.path)] = { path: file.path, data }
  }

  handleEvent(event: VaultEvent): void {
    const path = event.type === 'removed' ? event.path : event.file.path
    // Local changes not yet saved, or being saved, win; they're written over the incoming version.
    if (this.saveTimers.has(key(path)) || this.inFlight.has(key(path))) return
    if (event.type === 'removed') {
      delete this.boards[key(path)]
      this.unreadable.delete(key(path))
      this.ensureHome()
      this.trail = this.trail.filter((p) => key(p) !== key(path))
      this.canGoBack = this.trail.length > 0
      if (key(this.current) === key(path) && path !== HOME_BOARD) this.open(HOME_BOARD, { remember: false })
    } else {
      const existing = this.get(path)
      if (existing && serializeBoard(existing.data) === event.file.content) return
      this.addFile({ ...event.file, path: existing?.path ?? event.file.path })
    }
    // Undo would otherwise restore a version from before another device's change.
    this.undoStack.delete(key(path))
    this.redoStack.delete(key(path))
  }

  open(path: string, { remember = true } = {}): void {
    if (key(path) === key(this.current)) return
    if (remember) this.trail.push(this.current)
    this.canGoBack = this.trail.length > 0
    this.current = this.get(path)?.path ?? path
    this.selection = []
    this.setRecent([this.current, ...this.recent.filter((p) => key(p) !== key(this.current))].slice(0, 20))
  }

  private setRecent(paths: string[]): void {
    this.recent = paths
    writeRecent(this.root, paths)
  }

  /** Stars or unstars a folder; the star is kept in its file, so it shows on every device. */
  toggleFavorite(path: string): void {
    if (path === HOME_BOARD) return
    this.update((data) => {
      if (data.btFavorite === true) delete data.btFavorite
      else data.btFavorite = true
    }, path)
  }

  back(): void {
    const previous = this.trail.pop()
    this.canGoBack = this.trail.length > 0
    if (previous) this.open(previous, { remember: false })
  }

  /** Creates an empty board in Boards/ and returns its path. */
  create(name: string): string {
    const base = fileNameFor(name.trim())
    let path = `${BOARDS_DIR}${base}${BOARD_EXT}`
    const taken = (p: string) => this.get(p) || this.unreadable.has(key(p))
    for (let i = 2; taken(path); i++) path = `${BOARDS_DIR}${base} ${i}${BOARD_EXT}`
    this.boards[key(path)] = { path, data: emptyBoard() }
    this.scheduleSave(path)
    return path
  }

  /** Renames a board's file and points cards on other boards at the new name. */
  rename(path: string, name: string): void {
    const board = this.get(path)
    const base = fileNameFor(name.trim())
    const dir = path.slice(0, path.lastIndexOf('/') + 1)
    const target = `${dir}${base}${BOARD_EXT}`
    if (!board || path === HOME_BOARD || target === path) return
    const taken = this.get(target)
    if ((taken && taken !== board) || this.unreadable.has(key(target))) {
      this.error = `There's already a board called “${base}”.`
      return
    }
    this.cancelSave(path)
    this.send({ renameFrom: path, path: target, content: serializeBoard($state.snapshot(board.data) as CanvasData) })
    this.moved(path, target)
  }

  /** Re-keys a board whose file moved, and updates cards that pointed at the old path. */
  private moved(from: string, to: string): void {
    if (from === to) return
    const board = this.get(from)
    if (board) {
      delete this.boards[key(from)]
      board.path = to
      this.boards[key(to)] = board
    }
    for (const stack of [this.undoStack, this.redoStack]) {
      const entries = stack.get(key(from))
      stack.delete(key(from))
      if (entries) stack.set(key(to), entries)
    }
    const view = this.views[key(from)]
    if (view) {
      delete this.views[key(from)]
      this.setView(view, to)
    }
    if (key(this.current) === key(from)) this.current = to
    this.trail = this.trail.map((p) => (key(p) === key(from) ? to : p))
    if (this.recent.some((p) => key(p) === key(from))) this.setRecent(this.recent.map((p) => (key(p) === key(from) ? to : p)))
    this.fileMoved(from, to)
  }

  /** Points cards on every board, and in their undo history, at a note or board's new path. */
  fileMoved(from: string, to: string): void {
    for (const board of Object.values(this.boards)) {
      if (renameFile(board.data, from, to)) this.scheduleSave(board.path)
    }
    for (const stack of [this.undoStack, this.redoStack]) {
      for (const entries of stack.values()) for (const data of entries) renameFile(data, from, to)
    }
  }

  trash(path: string): void {
    if (path === HOME_BOARD) return
    this.cancelSave(path)
    delete this.boards[key(path)]
    this.setRecent(this.recent.filter((p) => key(p) !== key(path)))
    if (key(this.current) === key(path)) {
      this.trail = []
      this.canGoBack = false
      this.current = HOME_BOARD
      this.selection = []
    }
    vault.trash(path).catch(this.showError)
  }

  /** Sets the icon a board shows on its cards and in the sidebar; it's stored in the board's file. */
  setIcon(path: string, icon: BoardIcon): void {
    const clean = Object.fromEntries(Object.entries(icon).filter(([, value]) => value)) as BoardIcon
    this.update((data) => {
      if (Object.keys(clean).length) data.btIcon = clean
      else delete data.btIcon
    }, path)
  }

  /** Saves the current state for undo. Call before a change. */
  checkpoint(path = this.current): void {
    const board = this.get(path)
    if (!board) return
    const stack = this.undoStack.get(key(path)) ?? []
    stack.push($state.snapshot(board.data) as CanvasData)
    if (stack.length > HISTORY_LIMIT) stack.shift()
    this.undoStack.set(key(path), stack)
    this.redoStack.delete(key(path))
  }

  /** Changes a board without an undo step; for changes made in several steps, like a drag. */
  mutate(fn: (data: CanvasData) => void, path = this.current): void {
    const board = this.get(path)
    if (!board) return
    if (this.unreadable.has(key(path))) {
      this.error = `${path} couldn't be read, so it can't be changed here. Fix or remove the file first.`
      return
    }
    fn(board.data)
    this.scheduleSave(board.path)
  }

  /** Changes a board as one undo step, then restacks its columns. */
  update(fn: (data: CanvasData) => void, path = this.current): void {
    this.checkpoint(path)
    this.mutate((data) => {
      fn(data)
      layoutColumns(data)
    }, path)
  }

  undo(): void {
    this.step(this.undoStack, this.redoStack)
  }

  redo(): void {
    this.step(this.redoStack, this.undoStack)
  }

  /**
   * Takes back everything since the last checkpoint, with no redo step: for a drag that turned out
   * not to be a move, such as a note card dropped on a tag in the sidebar.
   */
  revert(): void {
    const board = this.board
    const previous = board && this.undoStack.get(key(board.path))?.pop()
    if (!board || !previous) return
    board.data = previous
    this.scheduleSave(board.path)
  }

  private step(from: Map<string, CanvasData[]>, to: Map<string, CanvasData[]>): void {
    const board = this.board
    const previous = board && from.get(key(board.path))?.pop()
    if (!board || !previous) return
    const stack = to.get(key(board.path)) ?? []
    stack.push($state.snapshot(board.data) as CanvasData)
    to.set(key(board.path), stack)
    board.data = previous
    const ids = new Set(previous.nodes.map((n) => n.id))
    this.selection = this.selection.filter((id) => ids.has(id))
    this.scheduleSave(board.path)
  }

  view(path = this.current): View | null {
    return this.views[key(path)] ?? readView(this.root, path)
  }

  setView(view: View, path = this.current): void {
    this.views[key(path)] = view
    // Panning sets the view on every mouse move; storing it can wait until the board is still.
    clearTimeout(this.viewTimer)
    const root = this.root
    this.viewTimer = setTimeout(() => writeView(root, path, view), 300)
  }

  private showError = (err: Error) => {
    this.error = err.message
  }

  private scheduleSave(path: string): void {
    clearTimeout(this.saveTimers.get(key(path)))
    this.saveTimers.set(
      key(path),
      setTimeout(() => this.flush(path), SAVE_DELAY_MS),
    )
  }

  private cancelSave(path: string): void {
    clearTimeout(this.saveTimers.get(key(path)))
    this.saveTimers.delete(key(path))
  }

  private pendingSave(path: string): PendingSave | null {
    this.cancelSave(path)
    const board = this.get(path)
    return board && { path: board.path, content: serializeBoard($state.snapshot(board.data) as CanvasData) }
  }

  private flush(path: string): void {
    const save = this.pendingSave(path)
    if (save) this.send(save)
  }

  /** Writes a board, following it if storage gave it a different name. */
  private send(save: PendingSave): void {
    const k = key(save.path)
    this.inFlight.set(k, (this.inFlight.get(k) ?? 0) + 1)
    vault
      .save(save)
      .then((actual) => this.moved(save.path, actual))
      .catch(this.showError)
      .finally(() => {
        const left = (this.inFlight.get(k) ?? 1) - 1
        if (left) this.inFlight.set(k, left)
        else this.inFlight.delete(k)
      })
  }

  /** Every board save that's waiting, for saving synchronously while the window closes. */
  takeAllSaves(): PendingSave[] {
    return [...this.saveTimers.keys()].flatMap((path) => this.pendingSave(path) ?? [])
  }
}

export const boards = new BoardsStore()

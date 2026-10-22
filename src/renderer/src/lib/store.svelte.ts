import type { MenuAction, NoteFile, PendingSave, VaultEvent, WorkspaceInfo } from '../../../shared/types'
import {
  addTag,
  baseName,
  buildNote,
  buildTagTree,
  contentOf,
  DAILY_DIR,
  dailyPath,
  dailyTitle,
  fileNameFor,
  INBOX_DIR,
  isLinkable,
  parseNote,
  plainLine,
  rewriteLinks,
  setFrontmatterValue,
  type Note,
  type Task,
} from './note'
import { isBoardPath } from './board'
import { boards } from './boards.svelte'
import { createIndex, remove, upsert } from './search'

export type Filter =
  | { kind: 'all' }
  | { kind: 'inbox' }
  | { kind: 'daily' }
  | { kind: 'pinned' }
  | { kind: 'untagged' }
  | { kind: 'tasks' }
  | { kind: 'tag'; tag: string }

export interface Backlink {
  note: Note
  /** The line that contains the link. */
  context: string
}

export interface TaskItem {
  note: Note
  task: Task
}

const SAVE_DELAY_MS = 600
const NOTES_DIR = 'Notes/'

const { vault, app } = window.bt

function matches(note: Note, filter: Filter): boolean {
  switch (filter.kind) {
    case 'all':
      return true
    case 'inbox':
      return note.path.startsWith(INBOX_DIR)
    case 'daily':
      return note.path.startsWith(DAILY_DIR)
    case 'pinned':
      return note.pinned
    case 'untagged':
      return note.tags.length === 0
    case 'tasks':
      return note.tasks.some((t) => !t.done)
    case 'tag':
      return note.tags.some((t) => t === filter.tag || t.startsWith(`${filter.tag}/`))
  }
}

function byPinnedThenRecent(a: Note, b: Note): number {
  return Number(b.pinned) - Number(a.pinned) || b.mtime - a.mtime
}

function localTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const key = (path: string) => path.toLowerCase()

const SIDEBAR_KEY = 'bt.sidebarHidden'

/** A remembered on/off setting; storage can be unavailable, and then it's off. */
function readFlag(name: string): boolean {
  try {
    return localStorage.getItem(name) === 'true'
  } catch {
    return false
  }
}

/** The names a note answers to in a `[[link]]`: its title and its file name, lower-cased. */
function namesOf(note: Note): Set<string> {
  return new Set([note.title.toLowerCase(), baseName(note.path).toLowerCase()].filter(Boolean))
}

class NotesStore {
  ready = $state(false)
  root = $state<string | null>(null)
  /** Boards first: the app opens to a board, and notes open beside it. */
  mode = $state<'board' | 'notes'>('board')
  /** In board mode, whether the selected note is open in a panel beside the board. */
  panelOpen = $state(false)
  /** Notes folders to switch between, and where Apple Notes captures go. */
  workspaces = $state<WorkspaceInfo[]>([])
  captureWorkspace = $state<string | null>(null)
  /** Whether the Find Folder search is open. */
  folderSearch = $state(false)
  /** In board mode, whether the sidebar is hidden so the board fills the window. */
  sidebarHidden = $state(readFlag(SIDEBAR_KEY))
  selectedId = $state<string | null>(null)
  filter = $state<Filter>({ kind: 'all' })
  query = $state('')
  error = $state<string | null>(null)
  /** Bumped when the search box should take focus. */
  searchFocus = $state(0)
  /** Asks the editor to focus a note with the cursor at the end of a body line (0-based). */
  focus = $state<{ id: string; line: number } | null>(null)

  // Notes live in a plain Map for speed; `revision` is the reactive signal that something changed.
  private notes = new Map<string, Note>()
  private idByPath = new Map<string, string>()
  /** Each note's title as of its last save, so links can be updated when the title changes. */
  private savedTitles = new Map<string, string>()
  private index = createIndex()
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private revision = $state(0)
  /** Bumped when a note other than the open one changes, so the editor redraws links to it. */
  otherNotesVersion = $state(0)

  visible = $derived.by(() => {
    void this.revision
    const query = this.query.trim()
    if (query) return this.index.search(query).flatMap((r) => this.notes.get(r.id) ?? []).filter((n) => matches(n, this.filter))
    const list = [...this.notes.values()].filter((n) => matches(n, this.filter))
    // Daily notes read best newest-date first; everything else by pinned, then last edited.
    return this.filter.kind === 'daily' ? list.sort((a, b) => b.path.localeCompare(a.path)) : list.sort(byPinnedThenRecent)
  })

  selected = $derived.by(() => {
    void this.revision
    return this.selectedId ? (this.notes.get(this.selectedId) ?? null) : null
  })

  tagTree = $derived.by(() => {
    void this.revision
    return buildTagTree(this.notes.values())
  })

  /** Lower-cased link name → note. Titles win over file names when two notes would claim the same name. */
  private linkIndex = $derived.by(() => {
    void this.revision
    const index = new Map<string, Note>()
    const notes = [...this.notes.values()].sort((a, b) => b.mtime - a.mtime)
    for (const note of notes) if (note.title && !index.has(note.title.toLowerCase())) index.set(note.title.toLowerCase(), note)
    for (const note of notes) {
      const name = baseName(note.path).toLowerCase()
      if (!index.has(name)) index.set(name, note)
    }
    return index
  })

  /** Lower-cased name → how many notes answer to it. */
  private nameCounts = $derived.by(() => {
    void this.revision
    const counts = new Map<string, number>()
    for (const note of this.notes.values()) for (const name of namesOf(note)) counts.set(name, (counts.get(name) ?? 0) + 1)
    return counts
  })

  /**
   * The name to write in links to this note: its title when that's unambiguous and fits inside
   * `[[…]]`, otherwise its file name, which is unique in its folder and never contains `[`, `]` or `|`.
   */
  linkName(note: Note): string {
    const { title } = note
    if (isLinkable(title) && this.nameCounts.get(title.toLowerCase()) === 1) return title
    return baseName(note.path)
  }

  backlinks = $derived.by((): Backlink[] => {
    const target = this.selected
    if (!target) return []
    const result: Backlink[] = []
    for (const note of this.notes.values()) {
      if (note.id === target.id) continue
      const linked = note.links.filter((l) => this.resolve(l)?.id === target.id).map((l) => `[[${l.toLowerCase()}`)
      if (!linked.length) continue
      const line = note.body.split('\n').find((l) => linked.some((link) => l.toLowerCase().includes(link)))
      result.push({ note, context: plainLine(line ?? '') })
    }
    return result.sort((a, b) => b.note.mtime - a.note.mtime)
  })

  /** How many notes wait in Inbox/ to be tagged and filed. */
  inboxCount = $derived.by(() => {
    void this.revision
    let count = 0
    for (const note of this.notes.values()) if (note.path.startsWith(INBOX_DIR)) count++
    return count
  })

  /** Every tag in use, most used first, for suggestions. */
  allTags = $derived.by(() => {
    void this.revision
    const counts = new Map<string, number>()
    for (const note of this.notes.values()) for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag]) => tag)
  })

  /** Every open task in every note. */
  openTasks = $derived.by((): TaskItem[] => {
    void this.revision
    return [...this.notes.values()].flatMap((note) => note.tasks.filter((t) => !t.done).map((task) => ({ note, task })))
  })

  /** `YYYY-MM-DD` of every day that has a daily note. */
  dailyDates = $derived.by(() => {
    void this.revision
    const dates = new Set<string>()
    for (const note of this.notes.values()) if (note.path.startsWith(DAILY_DIR)) dates.add(baseName(note.path))
    return dates
  })

  async init(): Promise<void> {
    vault.onEvent((event) => this.handleEvent(event))
    app.onMenu((action) => this.handleMenu(action))
    // Fires on close, quit and reload, so edits made in the last moment before any of them are kept.
    window.addEventListener('beforeunload', () => this.saveAllNow())
    this.root = await vault.root()
    if (this.root) await this.load()
    await this.loadWorkspaces()
    this.ready = true
  }

  private async load(): Promise<void> {
    const files = await vault.loadAll()
    this.notes.clear()
    this.idByPath.clear()
    this.savedTitles.clear()
    this.index = createIndex()
    for (const file of files) if (!isBoardPath(file.path)) this.addFile(file)
    boards.load(
      files.filter((f) => isBoardPath(f.path)),
      this.root ?? '',
    )
    this.selectedId = this.visible[0]?.id ?? null
    this.panelOpen = false
  }

  private addFile(file: NoteFile, id: string = crypto.randomUUID()): void {
    const note = parseNote(id, file)
    this.savedTitles.set(id, note.title)
    this.put(note)
  }

  private put(note: Note): void {
    const previous = this.notes.get(note.id)
    if (previous && key(previous.path) !== key(note.path)) this.idByPath.delete(key(previous.path))
    this.notes.set(note.id, note)
    this.idByPath.set(key(note.path), note.id)
    upsert(this.index, note)
    this.revision++
    if (note.id !== this.selectedId) this.otherNotesVersion++
  }

  private drop(id: string): void {
    const note = this.notes.get(id)
    if (!note) return
    this.notes.delete(id)
    this.idByPath.delete(key(note.path))
    this.savedTitles.delete(id)
    remove(this.index, id)
    this.revision++
    this.otherNotesVersion++
  }

  private showError = (err: Error) => {
    this.error = err.message
  }

  /** Saves a note. If its file name was taken by a note we hadn't loaded yet, follows it to the new name. */
  private save(id: string, save: PendingSave): void {
    vault
      .save(save)
      .then((actual) => {
        const note = this.notes.get(id)
        if (actual !== save.path && note?.path === save.path) {
          this.put({ ...note, path: actual })
          boards.fileMoved(save.path, actual)
        }
      })
      .catch(this.showError)
  }

  /** The note stored at a path, ignoring case. */
  noteByPath(path: string): Note | null {
    void this.revision
    const id = this.idByPath.get(key(path))
    return id ? (this.notes.get(id) ?? null) : null
  }

  /** Notes to pick from: search results for a query, otherwise the most recently edited. */
  findNotes(query: string, limit = 30): Note[] {
    void this.revision
    const q = query.trim()
    const list = q
      ? this.index.search(q).flatMap((r) => this.notes.get(r.id) ?? [])
      : [...this.notes.values()].sort((a, b) => b.mtime - a.mtime)
    return list.slice(0, limit)
  }

  /** In board mode, opens a note in the panel beside the board. */
  openInPanel(id: string, focusLine?: number): void {
    this.panelOpen = true
    this.open(id, focusLine)
  }

  closePanel(): void {
    this.panelOpen = false
  }

  toggleSidebar(): void {
    this.sidebarHidden = !this.sidebarHidden
    try {
      localStorage.setItem(SIDEBAR_KEY, String(this.sidebarHidden))
    } catch {
      // Not remembered, but it still toggles.
    }
  }

  /** The note a `[[link]]` points to: matched by title, then by file name, ignoring case. */
  resolve(target: string): Note | null {
    return this.linkIndex.get(target.trim().toLowerCase()) ?? null
  }

  /** All link names, for autocomplete. */
  linkNames(): string[] {
    return [...this.notes.values()].map((note) => this.linkName(note))
  }

  select(id: string | null): void {
    if (this.selectedId && this.selectedId !== id && this.saveTimers.has(this.selectedId)) this.flush(this.selectedId)
    this.selectedId = id
  }

  /** Selects a note, switching to all notes if the current view doesn't include it. */
  open(id: string, focusLine?: number): void {
    const note = this.notes.get(id)
    if (!note) return
    if (!matches(note, this.filter) || this.query) {
      this.filter = { kind: 'all' }
      this.query = ''
    }
    this.select(id)
    if (focusLine !== undefined) this.focus = { id, line: focusLine }
  }

  /** Follows a `[[link]]`, creating the note if nothing has that name yet. */
  openLink(target: string): void {
    const note = this.resolve(target)
    if (note) this.open(note.id)
    else this.createNote({ title: target.trim() })
  }

  setFilter(filter: Filter): void {
    this.mode = 'notes'
    this.filter = filter
    this.query = ''
    if (!this.visible.some((n) => n.id === this.selectedId)) this.select(this.visible[0]?.id ?? null)
  }

  edit(id: string, body: string): void {
    const note = this.notes.get(id)
    if (!note || note.body === body) return
    this.put(buildNote(id, note.path, note.frontmatter, body, Date.now()))
    this.scheduleSave(id)
  }

  togglePin(id: string): void {
    const note = this.notes.get(id)
    if (!note) return
    const frontmatter = setFrontmatterValue(note.frontmatter, 'pinned', String(!note.pinned))
    this.put(buildNote(id, note.path, frontmatter, note.body, note.mtime))
    this.scheduleSave(id)
  }

  toggleTask(id: string, line: number): void {
    const note = this.notes.get(id)
    if (!note) return
    const lines = note.body.split('\n')
    lines[line] = lines[line].replace(/\[([ xX])\]/, (_m, mark: string) => (mark === ' ' ? '[x]' : '[ ]'))
    this.edit(id, lines.join('\n'))
  }

  /**
   * Creates a note in Notes/. With a title (from a link), the note starts with it; otherwise it
   * starts empty, tagged with the current tag. Selects it unless `select` is false.
   */
  createNote({ title, select = true }: { title?: string; select?: boolean } = {}): Note | null {
    if (!this.root) return null
    const id = crypto.randomUUID()
    const tagLine = this.filter.kind === 'tag' && !title ? `\n\n#${this.filter.tag}` : ''
    const body = title ? `# ${title}\n\n` : `# ${tagLine}`
    const frontmatter = setFrontmatterValue('', 'created', localTimestamp())
    const draft = buildNote(id, '', frontmatter, body, Date.now())
    const note = { ...draft, path: this.pathFor(draft, NOTES_DIR) }
    this.savedTitles.set(id, note.title)
    this.put(note)
    this.save(id, { path: note.path, content: contentOf(note) })
    if (select) this.open(id, title ? 2 : 0)
    return note
  }

  /** Creates an empty note to be linked from the current one; returns its link name. */
  createSubpage(): { id: string; linkName: string } | null {
    const note = this.createNote({ select: false })
    return note && { id: note.id, linkName: this.linkName(note) }
  }

  /** Opens the daily note for a date, creating it if needed. */
  openDaily(date = new Date()): void {
    if (!this.root) return
    const path = dailyPath(date)
    this.mode = 'notes'
    this.filter = { kind: 'daily' }
    this.query = ''
    const existing = this.idByPath.get(key(path))
    if (existing) return this.select(existing)

    const id = crypto.randomUUID()
    const frontmatter = setFrontmatterValue('', 'created', localTimestamp())
    const note = buildNote(id, path, frontmatter, `# ${dailyTitle(date)}\n\n`, Date.now())
    this.savedTitles.set(id, note.title)
    this.put(note)
    this.save(id, { path, content: contentOf(note) })
    this.select(id)
    this.focus = { id, line: 2 }
  }

  /** The note to select after this one leaves the list: the next one, else the one before. */
  private neighbor(id: string): string | null {
    const list = this.visible
    const position = list.findIndex((n) => n.id === id)
    return (list[position + 1] ?? list[position - 1])?.id ?? null
  }

  /** Tags the note stored at a path, for a note card on a board. */
  tagNoteAt(path: string, tag: string): void {
    const note = this.noteByPath(path)
    if (note) this.tagNote(note.id, tag)
  }

  tagNote(id: string, tag: string): void {
    const note = this.notes.get(id)
    if (note) this.edit(id, addTag(note.body, tag))
  }

  /** Moves a note from Inbox/ to Notes/, then goes on to the next note in the Inbox. */
  fileNote(id: string): void {
    // Pending edits are saved first, under the note's current folder.
    if (this.saveTimers.has(id)) this.flush(id)
    const note = this.notes.get(id)
    if (!note || !note.path.startsWith(INBOX_DIR)) return
    const next = this.filter.kind === 'inbox' ? this.neighbor(id) : id
    const path = this.pathFor(note, NOTES_DIR)
    this.put({ ...note, path })
    boards.fileMoved(note.path, path)
    this.save(id, { path, content: contentOf(note), renameFrom: note.path })
    if (this.selectedId === id) this.select(next)
  }

  trashNote(id: string): void {
    const note = this.notes.get(id)
    if (!note) return
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    const next = this.neighbor(id)
    this.drop(id)
    if (this.selectedId === id) this.selectedId = next
    if (this.mode === 'board') this.panelOpen = false
    vault.trash(note.path).catch(this.showError)
  }

  async chooseFolder(): Promise<void> {
    this.saveAllNow()
    const root = await vault.chooseRoot()
    if (!root) return
    this.root = root
    await this.load()
    await this.loadWorkspaces()
  }

  async loadWorkspaces(): Promise<void> {
    const { workspaces, capture } = await window.bt.workspaces.list()
    this.workspaces = workspaces
    this.captureWorkspace = capture
  }

  /** Opens another workspace, saving everything waiting to be saved in this one first. */
  async switchWorkspace(path: string): Promise<void> {
    if (this.root && path.toLowerCase() === this.root.toLowerCase()) return
    this.saveAllNow()
    try {
      this.root = await window.bt.workspaces.switchTo(path)
      await this.load()
    } catch (err) {
      this.error = (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    }
    await this.loadWorkspaces()
  }

  async addWorkspace(): Promise<void> {
    this.saveAllNow()
    const root = await window.bt.workspaces.add()
    if (root) {
      this.root = root
      await this.load()
    }
    await this.loadWorkspaces()
  }

  async renameWorkspace(path: string, name: string): Promise<void> {
    await window.bt.workspaces.rename(path, name)
    await this.loadWorkspaces()
  }

  async removeWorkspace(path: string): Promise<void> {
    try {
      await window.bt.workspaces.remove(path)
    } catch (err) {
      this.error = (err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    }
    await this.loadWorkspaces()
  }

  async setCaptureWorkspace(path: string): Promise<void> {
    await window.bt.workspaces.setCapture(path)
    await this.loadWorkspaces()
  }

  private scheduleSave(id: string): void {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.set(
      id,
      setTimeout(() => this.flush(id), SAVE_DELAY_MS),
    )
  }

  /**
   * Cancels a note's save timer and works out its save: a rename if the title changed (daily
   * notes keep their date file names), then a write. Links to the old title are updated too.
   */
  private takePendingSave(id: string): PendingSave | null {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    const note = this.notes.get(id)
    if (!note) return null
    const dir = note.path.slice(0, note.path.lastIndexOf('/') + 1)
    const path = dir === DAILY_DIR ? note.path : this.pathFor(note, dir)
    const save: PendingSave = { path, content: contentOf(note) }
    // Names that stopped pointing here: the previous title if it changed, the old file name if renamed.
    const oldNames: string[] = []
    const savedTitle = this.savedTitles.get(id) ?? note.title
    if (savedTitle !== note.title) oldNames.push(savedTitle)
    if (path !== note.path) {
      oldNames.push(baseName(note.path))
      save.renameFrom = note.path
      this.put({ ...note, path })
      boards.fileMoved(note.path, path)
    }
    this.savedTitles.set(id, note.title)
    if (oldNames.length) this.updateLinks(id, oldNames, this.linkName(this.notes.get(id)!))
    return save
  }

  /** Rewrites `[[old name]]` links in other notes after a note's title changed. */
  private updateLinks(id: string, oldNames: string[], newName: string): void {
    const names = [...new Set(oldNames.filter((n) => n && n.toLowerCase() !== newName.toLowerCase()))]
      // A name another note still answers to is left alone; those links point there now.
      .filter((n) => this.resolve(n) === null || this.resolve(n)?.id === id)
    if (!names.length) return
    const lower = new Set(names.map((n) => n.toLowerCase()))
    for (const other of this.notes.values()) {
      if (other.id === id || !other.links.some((l) => lower.has(l.toLowerCase()))) continue
      const body = rewriteLinks(other.body, names, newName)
      if (body === other.body) continue
      this.put(buildNote(other.id, other.path, other.frontmatter, body, Date.now()))
      this.scheduleSave(other.id)
    }
  }

  private flush(id: string): void {
    const save = this.takePendingSave(id)
    if (save) this.save(id, save)
  }

  private saveAllNow(): void {
    const saves: PendingSave[] = []
    // Saving one note can schedule saves of others (link updates), so loop until none are left.
    while (this.saveTimers.size) {
      const save = this.takePendingSave(this.saveTimers.keys().next().value!)
      if (save) saves.push(save)
    }
    // After the notes: saving a renamed note points board cards at its new file.
    saves.push(...boards.takeAllSaves())
    if (saves.length) app.saveNow(saves)
  }

  /** `dir/Title.md`, adding " 2", " 3"… if another note already has that name. */
  private pathFor(note: Note, dir: string): string {
    const base = fileNameFor(note.title)
    let candidate = `${dir}${base}.md`
    for (let i = 2; ; i++) {
      const owner = this.idByPath.get(key(candidate))
      if (!owner || owner === note.id) return candidate
      candidate = `${dir}${base} ${i}.md`
    }
  }

  private handleEvent(event: VaultEvent): void {
    if (isBoardPath(event.type === 'removed' ? event.path : event.file.path)) return boards.handleEvent(event)
    if (event.type === 'removed') {
      const id = this.idByPath.get(key(event.path))
      if (!id || this.saveTimers.has(id)) return
      this.drop(id)
      if (this.selectedId === id) this.selectedId = null
      return
    }
    const id = this.idByPath.get(key(event.file.path))
    if (!id) return this.addFile(event.file)
    const note = this.notes.get(id)!
    // Unsaved local edits win; they'll be written over the incoming version.
    if (this.saveTimers.has(id) || contentOf(note) === event.file.content) return
    this.addFile({ ...event.file, path: note.path }, id)
  }

  private handleMenu(action: MenuAction): void {
    // On a board, the board adds the note as a card and opens it beside the board.
    if (action === 'new-note' && this.mode === 'board') boards.newNoteRequest++
    else if (action === 'new-note') this.createNote()
    else if (action === 'choose-folder') void this.chooseFolder()
    else if (action === 'find-folder') this.folderSearch = true
    else if (action === 'search') {
      this.mode = 'notes'
      this.searchFocus++
    }
  }
}

/** The drag data type of a note dragged from the note list, which tags in the sidebar accept. */
export const NOTE_DRAG = 'application/x-bt-note'

export const store = new NotesStore()

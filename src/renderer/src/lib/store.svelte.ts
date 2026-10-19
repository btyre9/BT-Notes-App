import type { MenuAction, NoteFile, PendingSave, VaultEvent } from '../../../shared/types'
import { buildNote, buildTagTree, contentOf, fileNameFor, parseNote, setFrontmatterValue, type Note } from './note'
import { createIndex, remove, upsert } from './search'

export type Filter =
  | { kind: 'all' }
  | { kind: 'pinned' }
  | { kind: 'untagged' }
  | { kind: 'todo' }
  | { kind: 'tag'; tag: string }

const SAVE_DELAY_MS = 600
const NOTES_DIR = 'Notes/'

const { vault, app } = window.bt

function matches(note: Note, filter: Filter): boolean {
  switch (filter.kind) {
    case 'all':
      return true
    case 'pinned':
      return note.pinned
    case 'untagged':
      return note.tags.length === 0
    case 'todo':
      return note.hasOpenTasks
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

class NotesStore {
  ready = $state(false)
  root = $state<string | null>(null)
  selectedId = $state<string | null>(null)
  filter = $state<Filter>({ kind: 'all' })
  query = $state('')
  error = $state<string | null>(null)
  /** Bumped when the search box should take focus. */
  searchFocus = $state(0)
  /** Id of a just-created note, so the editor puts the cursor in its title. */
  newNoteId = $state<string | null>(null)

  // Notes live in a plain Map for speed; `revision` is the reactive signal that something changed.
  private notes = new Map<string, Note>()
  private idByPath = new Map<string, string>()
  private index = createIndex()
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private revision = $state(0)

  visible = $derived.by(() => {
    void this.revision
    const query = this.query.trim()
    const list = query
      ? this.index.search(query).flatMap((r) => this.notes.get(r.id) ?? [])
      : [...this.notes.values()].sort(byPinnedThenRecent)
    return list.filter((n) => matches(n, this.filter))
  })

  selected = $derived.by(() => {
    void this.revision
    return this.selectedId ? (this.notes.get(this.selectedId) ?? null) : null
  })

  tagTree = $derived.by(() => {
    void this.revision
    return buildTagTree(this.notes.values())
  })

  async init(): Promise<void> {
    vault.onEvent((event) => this.handleEvent(event))
    app.onMenu((action) => this.handleMenu(action))
    // Fires on close, quit and reload, so edits made in the last moment before any of them are kept.
    window.addEventListener('beforeunload', () => this.saveAllNow())
    this.root = await vault.root()
    if (this.root) await this.load()
    this.ready = true
  }

  private async load(): Promise<void> {
    const files = await vault.loadAll()
    this.notes.clear()
    this.idByPath.clear()
    this.index = createIndex()
    for (const file of files) this.addFile(file)
    this.selectedId = this.visible[0]?.id ?? null
  }

  private addFile(file: NoteFile): void {
    this.put(parseNote(crypto.randomUUID(), file))
  }

  private put(note: Note): void {
    const previous = this.notes.get(note.id)
    if (previous && key(previous.path) !== key(note.path)) this.idByPath.delete(key(previous.path))
    this.notes.set(note.id, note)
    this.idByPath.set(key(note.path), note.id)
    upsert(this.index, note)
    this.revision++
  }

  private drop(id: string): void {
    const note = this.notes.get(id)
    if (!note) return
    this.notes.delete(id)
    this.idByPath.delete(key(note.path))
    remove(this.index, id)
    this.revision++
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
        if (actual !== save.path && note?.path === save.path) this.put({ ...note, path: actual })
      })
      .catch(this.showError)
  }

  select(id: string | null): void {
    if (this.selectedId && this.selectedId !== id && this.saveTimers.has(this.selectedId)) this.flush(this.selectedId)
    this.selectedId = id
  }

  setFilter(filter: Filter): void {
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

  createNote(): void {
    if (!this.root) return
    const id = crypto.randomUUID()
    const tagLine = this.filter.kind === 'tag' ? `\n\n#${this.filter.tag}` : ''
    const frontmatter = setFrontmatterValue('', 'created', localTimestamp())
    const draft = buildNote(id, '', frontmatter, `# ${tagLine}`, Date.now())
    const note = { ...draft, path: this.pathFor(draft, NOTES_DIR) }
    this.query = ''
    if (this.filter.kind !== 'tag') this.filter = { kind: 'all' }
    this.put(note)
    this.select(id)
    this.newNoteId = id
    this.save(id, { path: note.path, content: contentOf(note) })
  }

  trashNote(id: string): void {
    const note = this.notes.get(id)
    if (!note) return
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    const list = this.visible
    const position = list.findIndex((n) => n.id === id)
    this.drop(id)
    if (this.selectedId === id) this.selectedId = (list[position + 1] ?? list[position - 1])?.id ?? null
    vault.trash(note.path).catch(this.showError)
  }

  async chooseFolder(): Promise<void> {
    for (const id of [...this.saveTimers.keys()]) this.flush(id)
    const root = await vault.chooseRoot()
    if (!root) return
    this.root = root
    await this.load()
  }

  private scheduleSave(id: string): void {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.set(
      id,
      setTimeout(() => this.flush(id), SAVE_DELAY_MS),
    )
  }

  /** Cancels a note's save timer and works out its save: a rename if the title changed, then a write. */
  private takePendingSave(id: string): PendingSave | null {
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    const note = this.notes.get(id)
    if (!note) return null
    const dir = note.path.slice(0, note.path.lastIndexOf('/') + 1)
    const path = this.pathFor(note, dir)
    const save: PendingSave = { path, content: contentOf(note) }
    if (path !== note.path) {
      save.renameFrom = note.path
      this.put({ ...note, path })
    }
    return save
  }

  private flush(id: string): void {
    const save = this.takePendingSave(id)
    if (save) this.save(id, save)
  }

  private saveAllNow(): void {
    const saves = [...this.saveTimers.keys()].flatMap((id) => this.takePendingSave(id) ?? [])
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
    this.put(parseNote(id, { ...event.file, path: note.path }))
  }

  private handleMenu(action: MenuAction): void {
    if (action === 'new-note') this.createNote()
    else if (action === 'choose-folder') void this.chooseFolder()
    else if (action === 'search') this.searchFocus++
  }
}

export const store = new NotesStore()

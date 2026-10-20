import { constants, existsSync, mkdirSync, renameSync, statSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import * as fs from 'node:fs/promises'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { NoteFile, PendingSave, VaultEvent } from '../shared/types'

const TRASH = '.Trash'
const ATTACHMENTS = 'Attachments'
// Cloud sync folders don't always report changes synced from other devices,
// so the folder is also rescanned on a timer.
const RESCAN_MS = 60_000
const DEBOUNCE_MS = 300

/** A file name that's safe on Windows and macOS, keeping as much of the original as it can. */
function safeName(name: string): string {
  return basename(name).replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/^[. ]+|[. ]+$/g, '') || 'Attachment'
}

/** True for notes (.md) and boards (.canvas) outside hidden folders, .Trash and Attachments. */
function isNotePath(rel: string): boolean {
  const parts = rel.split('/')
  return /\.(md|canvas)$/i.test(rel) && parts[0] !== ATTACHMENTS && !parts.some((p) => p.startsWith('.'))
}

/**
 * Notes are small, so saves and trash moves are synchronous: they finish in the order they
 * arrive and can't interleave, and they also work while the window is unloading.
 */
export class Vault {
  /** Last modification time seen or written for each note, used to skip our own writes. */
  private known = new Map<string, number>()
  private timers = new Map<string, NodeJS.Timeout>()
  private watcher: FSWatcher | null = null
  private rescanTimer: NodeJS.Timeout | null = null

  constructor(
    readonly root: string,
    private emit: (event: VaultEvent) => void,
  ) {}

  /** The absolute path of a file in the notes folder; throws for paths that lead outside it. */
  abs(rel: string): string {
    const path = resolve(this.root, rel)
    if (!path.startsWith(resolve(this.root) + sep)) throw new Error(`Path is outside the notes folder: ${rel}`)
    return path
  }

  private rel(abs: string): string {
    return relative(this.root, abs).split(sep).join('/')
  }

  private async listNotes(dir = this.root): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const nested = await Promise.all(
      entries.map((entry) => {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) {
          const skip = entry.name.startsWith('.') || (dir === this.root && entry.name === ATTACHMENTS)
          return skip ? [] : this.listNotes(path)
        }
        return entry.isFile() && isNotePath(this.rel(path)) ? [this.rel(path)] : []
      }),
    )
    return nested.flat()
  }

  async loadAll(): Promise<NoteFile[]> {
    const paths = await this.listNotes()
    const notes: NoteFile[] = []
    // Read in batches to keep the number of open files bounded.
    for (let i = 0; i < paths.length; i += 64) {
      const results = await Promise.allSettled(paths.slice(i, i + 64).map((p) => this.read(p)))
      for (const [j, result] of results.entries()) {
        // A file Drive removed mid-scan, or one it can't fetch offline, shouldn't block the rest.
        if (result.status === 'fulfilled') notes.push(result.value)
        else console.warn(`Skipped ${paths[i + j]}:`, result.reason)
      }
    }
    this.known = new Map(notes.map((n) => [n.path, n.mtime]))
    return notes
  }

  private async read(rel: string): Promise<NoteFile> {
    const abs = this.abs(rel)
    const [content, stat] = await Promise.all([fs.readFile(abs, 'utf8'), fs.stat(abs)])
    return { path: rel, content, mtime: stat.mtimeMs }
  }

  /** `dir/Name 2.md`, `dir/Name 3.md`… whichever is free on disk first. */
  private freePath(rel: string): string {
    const ext = extname(rel)
    const base = ext ? rel.slice(0, -ext.length) : rel
    let candidate = rel
    for (let i = 2; existsSync(this.abs(candidate)); i++) candidate = `${base} ${i}${ext}`
    return candidate
  }

  /**
   * Writes a note, first moving it from `renameFrom` if its title changed. Never overwrites a
   * file this app hasn't seen, such as one Drive just synced in from another device; the note
   * gets a free name instead. Returns the path actually written.
   */
  save({ renameFrom, path, content }: PendingSave): string {
    let target = path
    const sameFile = (a: string, b: string) => a.toLowerCase() === b.toLowerCase() // Windows and macOS ignore case
    if (renameFrom && existsSync(this.abs(renameFrom))) {
      if (!sameFile(renameFrom, target) && existsSync(this.abs(target))) target = this.freePath(target)
      mkdirSync(dirname(this.abs(target)), { recursive: true })
      renameSync(this.abs(renameFrom), this.abs(target))
      this.known.delete(renameFrom)
    } else if (!this.known.has(target) && existsSync(this.abs(target))) {
      target = this.freePath(target)
    }
    const abs = this.abs(target)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, content, 'utf8')
    this.known.set(target, statSync(abs).mtimeMs)
    return target
  }

  /** Copies a dropped or pasted file into Attachments/ under a free name; returns its path. */
  async addAttachment(name: string, data: Uint8Array): Promise<string> {
    return this.writeAttachment(name, (target) => fs.writeFile(target, data, { flag: 'wx' }))
  }

  /**
   * Copies a file from disk into Attachments/ and returns its path there. Large files such as
   * videos are copied directly rather than passed through the window. A file that's already in
   * Attachments/ is used where it is.
   */
  async importFile(source: string): Promise<string> {
    const from = resolve(source)
    // A file that's already in the notes folder is used where it is, so a dropped note or board
    // links to the one the app knows rather than to a copy.
    if (from.toLowerCase().startsWith(resolve(this.root).toLowerCase() + sep) && existsSync(from)) return this.rel(from)
    // Notes and boards from elsewhere go where notes and boards live, so the app loads them.
    const folder = /\.md$/i.test(from) ? 'Notes' : /\.canvas$/i.test(from) ? 'Boards' : ATTACHMENTS
    return this.writeAttachment(from, (target) => fs.copyFile(from, target, constants.COPYFILE_EXCL), folder)
  }

  /** Writes a new file into a folder (Attachments/ unless given) under the first free version of a name. */
  private async writeAttachment(name: string, write: (target: string) => Promise<void>, folder = ATTACHMENTS): Promise<string> {
    const safe = safeName(name)
    await fs.mkdir(this.abs(folder), { recursive: true })
    // Writing fails if the file appeared since freePath looked, for example when two files with
    // the same name are dropped together; then the next free name is tried.
    for (;;) {
      const rel = this.freePath(`${folder}/${safe}`)
      try {
        await write(this.abs(rel))
        return rel
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
      }
    }
  }

  /** Moves a note or board into .Trash inside the notes folder, so it syncs and can be restored. */
  trash(rel: string): void {
    // A board trashed before its first save has no file yet.
    if (!existsSync(this.abs(rel))) return
    const ext = extname(rel)
    const name = basename(rel, ext)
    let dest = join(this.root, TRASH, `${name}${ext}`)
    for (let i = 2; existsSync(dest); i++) dest = join(this.root, TRASH, `${name} ${i}${ext}`)
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(this.abs(rel), dest)
    this.known.delete(rel)
  }

  watch(): void {
    try {
      this.watcher = watch(this.root, { recursive: true }, (_type, name) => {
        const rel = name?.split(sep).join('/')
        if (rel && isNotePath(rel)) this.schedule(rel)
      })
      this.watcher.on('error', (err) => console.warn('File watcher stopped; relying on rescans:', err))
    } catch (err) {
      console.warn('File watching unavailable; relying on rescans:', err)
    }
    this.rescanTimer = setInterval(() => {
      this.rescan().catch((err) => console.warn('Rescan failed:', err))
    }, RESCAN_MS)
  }

  close(): void {
    this.watcher?.close()
    if (this.rescanTimer) clearInterval(this.rescanTimer)
    this.timers.forEach(clearTimeout)
  }

  private schedule(rel: string): void {
    clearTimeout(this.timers.get(rel))
    this.timers.set(
      rel,
      setTimeout(() => {
        this.timers.delete(rel)
        this.check(rel).catch((err) => console.warn(`Could not check ${rel}:`, err))
      }, DEBOUNCE_MS),
    )
  }

  /** Compares a file on disk with what we last saw and reports any difference. */
  private async check(rel: string): Promise<void> {
    try {
      const { mtimeMs } = await fs.stat(this.abs(rel))
      const before = this.known.get(rel)
      if (before === mtimeMs) return
      const file = await this.read(rel)
      // The app wrote this note while it was being read; that write is newer, so drop what was read.
      if (this.known.get(rel) !== before) return
      this.known.set(rel, file.mtime)
      this.emit({ type: 'changed', file })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      if (this.known.delete(rel)) this.emit({ type: 'removed', path: rel })
    }
  }

  private async rescan(): Promise<void> {
    const onDisk = new Set(await this.listNotes())
    for (const rel of onDisk) await this.check(rel)
    for (const rel of [...this.known.keys()]) if (!onDisk.has(rel)) await this.check(rel)
  }
}

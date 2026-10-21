/**
 * Moves notes from an Apple Notes folder into the notes folder's Inbox/ as Markdown. A note is
 * deleted from Apple Notes only after its file, and every image and attachment it uses, is
 * written and read back, and only if it wasn't edited while it was being imported. Apple Notes
 * keeps deleted notes in Recently Deleted for 30 days.
 */
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'
import { fileNameFor, frontmatterValue, plainLine, splitFrontmatter } from '../src/renderer/src/lib/note.ts'
import { attachmentSlots, notesHtmlToMarkdown } from './notesHtml.ts'

export const INBOX = 'Inbox'
const ATTACHMENTS = 'Attachments'
/** Folders whose notes can't be the target of a duplicate check. */
const SKIP_DIRS = new Set([ATTACHMENTS, 'node_modules'])

export interface AppleNote {
  id: string
  name: string
  created: Date
  modified: Date
  body: string
  locked: boolean
  attachmentCount: number
}

/** Apple Notes, or a stand-in for it in tests. */
export interface NotesSource {
  /** Ids of the notes in the folder, or null if there's no such folder. */
  list(folder: string): Promise<string[] | null>
  read(id: string): Promise<AppleNote>
  /** Saves an attachment into a folder; returns the saved file's path, or null if Notes can't export it. */
  saveAttachment(noteId: string, index: number, dir: string): Promise<string | null>
  /** When the note was last changed, or null if it's gone. */
  modified(id: string): Promise<Date | null>
  delete(id: string): Promise<void>
}

export interface ImportOptions {
  folder?: string
  /** Import but leave the notes in Apple Notes. */
  keep?: boolean
  /** Show what would happen; write and delete nothing. */
  dryRun?: boolean
}

export interface ImportResult {
  name: string
  /** The note's file in the notes folder, if one was written or already there. */
  path?: string
  /** `duplicate`: the same text was already imported from another note. */
  status: 'imported' | 'already-imported' | 'duplicate' | 'skipped' | 'failed'
  deleted: boolean
  /** Why the note was skipped, failed, or kept in Apple Notes. */
  reason?: string
}

/** Local time with no zone, as the app writes `created`. */
export function localTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heic',
  'image/webp': 'webp',
  'image/tiff': 'tiff',
}
const IMAGE_FILE = /\.(png|jpe?g|gif|heic|heif|webp|tiff?|bmp|svg)$/i

/** The extension a file's first bytes show, for attachments that Notes saves without one. */
async function sniffExt(path: string): Promise<string> {
  const handle = await fs.open(path, 'r')
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(16), 0, 16, 0)
    const head = buffer.subarray(0, bytesRead)
    if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
    if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return '.jpg'
    if (head.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif'
    if (head.subarray(0, 5).toString('latin1') === '%PDF-') return '.pdf'
    if (head.subarray(4, 8).toString('latin1') === 'ftyp') {
      const brand = head.subarray(8, 12).toString('latin1')
      if (/^(heic|heix|mif1|msf1|hevc)$/.test(brand)) return '.heic'
      if (/^(M4A |M4B )$/.test(brand)) return '.m4a'
      if (brand === 'qt  ') return '.mov'
      return '.mp4'
    }
    return ''
  } finally {
    await handle.close()
  }
}

/** A Markdown link to a file in the notes folder; spaces and other characters are %-encoded, as Obsidian expects. */
function linkTo(rel: string, label: string): string {
  const url = rel.split('/').map(encodeURIComponent).join('/')
  return IMAGE_FILE.test(rel) ? `![](${url})` : `[${label.replace(/[[\]]/g, '')}](${url})`
}

/** Every Markdown file in the folder, except in Attachments/ and other skipped folders. */
async function markdownFiles(root: string, dir = ''): Promise<string[]> {
  let entries
  try {
    entries = await fs.readdir(join(root, dir), { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const e of entries) {
    const rel = dir ? `${dir}/${e.name}` : e.name
    if (e.isDirectory() && !SKIP_DIRS.has(e.name)) found.push(...(await markdownFiles(root, rel)))
    else if (e.isFile() && /\.md$/i.test(e.name)) found.push(rel)
  }
  return found
}

interface Imported {
  /** File of each imported note version, keyed by Apple Notes id and modification time. */
  versions: Map<string, string>
  /** File of each imported note, keyed by its text, to catch the same text captured twice. */
  texts: Map<string, string>
}

const versionKey = (note: AppleNote) => `${note.id} ${localTimestamp(note.modified)}`
const textOf = (content: string) => splitFrontmatter(content).body.trim()

/**
 * Notes already imported. Notes that were filed elsewhere or trashed count too, so they're never
 * imported twice.
 */
async function importedNotes(root: string): Promise<Imported> {
  const imported: Imported = { versions: new Map(), texts: new Map() }
  for (const rel of await markdownFiles(root)) {
    // The start of the file is enough to tell whether it came from Apple Notes.
    const handle = await fs.open(join(root, rel), 'r')
    let head: string
    try {
      const { buffer, bytesRead } = await handle.read(Buffer.alloc(2048), 0, 2048, 0)
      head = buffer.subarray(0, bytesRead).toString('utf8')
    } finally {
      await handle.close()
    }
    const { frontmatter } = splitFrontmatter(head)
    const id = frontmatterValue(frontmatter, 'appleNotesId')
    if (!id) continue
    imported.versions.set(`${id} ${frontmatterValue(frontmatter, 'appleNotesModified') ?? ''}`, rel)
    imported.texts.set(textOf(await fs.readFile(join(root, rel), 'utf8')), rel)
  }
  return imported
}

/** The first free path for a file name in a folder: `name.ext`, then `name 2.ext`, … */
function freePath(root: string, dir: string, name: string, ext: string, taken: Set<string>): string {
  for (let i = 1; ; i++) {
    const rel = `${dir}/${name}${i === 1 ? '' : ` ${i}`}${ext}`
    if (!taken.has(rel.toLowerCase()) && !existsSync(join(root, rel))) {
      taken.add(rel.toLowerCase())
      return rel
    }
  }
}

/** The Markdown file for a note: frontmatter, its title as a `# heading`, then its body. */
export function noteMarkdown(note: AppleNote, title: string, body: string): string {
  // Notes puts the title on the body's first line; it becomes the note's `# heading`.
  const lines = body.split('\n')
  if (lines.length && plainLine(lines[0].replace(/^#+\s*/, '')).trim() === title.trim()) lines.shift()
  const rest = lines.join('\n').replace(/^\n+/, '')
  return [
    '---',
    `created: ${localTimestamp(note.created)}`,
    'pinned: false',
    'source: apple-notes',
    `appleNotesId: ${note.id}`,
    `appleNotesModified: ${localTimestamp(note.modified)}`,
    '---',
    `# ${title}`,
    '',
    rest,
  ].join('\n').trimEnd() + '\n'
}

async function importOne(root: string, source: NotesSource, id: string, imported: Imported, opts: ImportOptions): Promise<ImportResult> {
  const note = await source.read(id)
  const title = note.name.trim() || `Capture ${localTimestamp(note.created).replace('T', ' ').slice(0, 16).replace(':', '.')}`
  if (note.locked) return { name: title, status: 'skipped', deleted: false, reason: 'locked with a password' }

  const deleteIfUnchanged = async (result: ImportResult): Promise<ImportResult> => {
    if (opts.keep || opts.dryRun) return result
    const now = await source.modified(id)
    if (!now || now.getTime() !== note.modified.getTime()) {
      return { ...result, reason: 'edited in Apple Notes while importing; kept there and will be imported again' }
    }
    await source.delete(id)
    return { ...result, deleted: true }
  }

  const done = imported.versions.get(versionKey(note))
  if (done) return deleteIfUnchanged({ name: title, path: done, status: 'already-imported', deleted: false })

  const taken = new Set<string>()
  const baseName = fileNameFor(title)
  const written: string[] = []
  const missing: string[] = []
  const tmp = await fs.mkdtemp(join(tmpdir(), 'bt-notes-import-'))
  try {
    // Attachments are saved first, so the Markdown can link to their final names. They go in
    // the body where Notes marks them if the marks and attachments match up, else at the end.
    const attachmentLinks: string[] = []
    for (let i = 0; i < note.attachmentCount; i++) {
      const saved = opts.dryRun ? null : await source.saveAttachment(id, i, join(tmp, String(i)))
      if (!saved) {
        if (!opts.dryRun) missing.push(`attachment ${i + 1}`)
        attachmentLinks.push(opts.dryRun ? `[attachment ${i + 1}]` : '')
        continue
      }
      const savedName = basename(saved)
      // A name like "Bill 8.28.2026" has a dot but no extension.
      const own = extname(savedName)
      const hasExt = /^\.[a-z0-9]{1,5}$/i.test(own) && /[a-z]/i.test(own)
      const ext = hasExt ? own : await sniffExt(saved)
      const stem = hasExt ? basename(savedName, own) : savedName
      // Notes names pasted images with a UUID; the note's title says more.
      const name = /^[0-9A-F]{8}-[0-9A-F]{4}-/i.test(stem) ? baseName : fileNameFor(stem)
      const rel = freePath(root, ATTACHMENTS, name, ext.toLowerCase(), taken)
      await fs.mkdir(join(root, ATTACHMENTS), { recursive: true })
      await fs.cp(saved, join(root, rel), { recursive: true, errorOnExist: true, force: false })
      written.push(rel)
      attachmentLinks.push(linkTo(rel, stem))
    }

    const inline = attachmentSlots(note.body) === note.attachmentCount
    const images: { rel: string; data: Buffer }[] = []
    const body = notesHtmlToMarkdown(note.body, {
      image: (mime, base64) => {
        const rel = freePath(root, ATTACHMENTS, baseName, `.${IMAGE_EXT[mime.toLowerCase()] ?? 'png'}`, taken)
        images.push({ rel, data: Buffer.from(base64, 'base64') })
        return linkTo(rel, baseName)
      },
      attachment: (index) => (inline ? (attachmentLinks[index] ?? '') : null),
    })
    const trailing = inline ? '' : attachmentLinks.filter(Boolean).join('\n\n')
    const content = noteMarkdown(note, title, trailing ? `${body}\n\n${trailing}` : body)
    // The same text captured twice, for example sent to Notes from two devices. Only plain-text
    // notes are compared; a note's images get new file names, so its text never matches.
    const same = !images.length && !note.attachmentCount ? imported.texts.get(textOf(content)) : undefined
    if (same) return deleteIfUnchanged({ name: title, path: same, status: 'duplicate', deleted: false })

    const path = freePath(root, INBOX, baseName, '.md', taken)

    if (opts.dryRun) return { name: title, path, status: 'imported', deleted: false, reason: 'dry run' }

    for (const image of images) {
      await fs.mkdir(join(root, ATTACHMENTS), { recursive: true })
      await fs.writeFile(join(root, image.rel), image.data, { flag: 'wx' })
      written.push(image.rel)
    }
    await fs.mkdir(join(root, INBOX), { recursive: true })
    await fs.writeFile(join(root, path), content, { flag: 'wx' })
    written.push(path)

    // Read everything back before anything is deleted from Apple Notes.
    if ((await fs.readFile(join(root, path), 'utf8')) !== content) throw new Error(`${path} didn't read back as written`)
    for (const image of images) {
      if (!(await fs.readFile(join(root, image.rel))).equals(image.data)) throw new Error(`${image.rel} didn't read back as written`)
    }
    imported.versions.set(versionKey(note), path)
    imported.texts.set(textOf(content), path)

    const result: ImportResult = { name: title, path, status: 'imported', deleted: false }
    if (missing.length) return { ...result, reason: `Apple Notes couldn't export ${missing.join(', ')}; kept there so nothing is lost` }
    return deleteIfUnchanged(result)
  } catch (err) {
    // Don't leave half an import behind; the note is still in Apple Notes to try again.
    for (const rel of written) await fs.rm(join(root, rel), { recursive: true, force: true })
    return { name: title, status: 'failed', deleted: false, reason: (err as Error).message }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

export async function importNotes(root: string, source: NotesSource, opts: ImportOptions = {}): Promise<ImportResult[] | null> {
  const ids = await source.list(opts.folder ?? 'Capture')
  if (ids === null) return null
  const imported = await importedNotes(root)
  const results: ImportResult[] = []
  // One at a time: each note can be large, and Notes handles one script request at a time.
  for (const id of ids) {
    try {
      results.push(await importOne(root, source, id, imported, opts))
    } catch (err) {
      results.push({ name: id, status: 'failed', deleted: false, reason: (err as Error).message })
    }
  }
  return results
}


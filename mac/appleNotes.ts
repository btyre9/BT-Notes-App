/**
 * Apple Notes through its scripting interface, run with `osascript -l JavaScript`. The first run
 * makes macOS ask whether the app running this (Terminal, or launchd's helper) may control Notes.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import type { AppleNote, NotesSource } from './importer.ts'

/** Runs a JXA script's run(argv) function and returns what it printed. */
function jxa(script: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    // Note bodies hold their images as base64, so a single note can be tens of megabytes.
    execFile('osascript', ['-l', 'JavaScript', '-e', script, ...args], { maxBuffer: 1 << 30 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr.trim().replace(/^execution error: /, '') || err.message))
      else resolve(stdout.trim())
    })
  })
}

const LIST = `function run(argv) {
  const Notes = Application('Notes')
  // The iCloud account first: that's where notes captured on the iPhone go.
  const accounts = Notes.accounts().sort((a, b) => (b.name() === 'iCloud') - (a.name() === 'iCloud'))
  for (const account of accounts) {
    const folders = account.folders.whose({ name: argv[0] })()
    if (folders.length) return JSON.stringify(folders[0].notes.id())
  }
  return 'null'
}`

const READ = `function run(argv) {
  const n = Application('Notes').notes.byId(argv[0])
  const locked = n.passwordProtected()
  return JSON.stringify({
    id: n.id(),
    name: n.name(),
    created: n.creationDate().toISOString(),
    modified: n.modificationDate().toISOString(),
    body: locked ? '' : n.body(),
    locked: locked,
    attachmentCount: locked ? 0 : n.attachments().length,
  })
}`

const SAVE_ATTACHMENT = `function run(argv) {
  const Notes = Application('Notes')
  const a = Notes.notes.byId(argv[0]).attachments()[Number(argv[1])]
  const path = argv[2] + '/' + (a.name() || 'Attachment').replace(/[\\/:]/g, '-')
  try {
    Notes.save(a, { in: Path(path) })
  } catch (e) {
    // Scanned documents and some other kinds can't be exported by script.
    return ''
  }
  return path
}`

const MODIFIED = `function run(argv) {
  try {
    return Application('Notes').notes.byId(argv[0]).modificationDate().toISOString()
  } catch (e) {
    return ''
  }
}`

const DELETE = `function run(argv) {
  const Notes = Application('Notes')
  Notes.delete(Notes.notes.byId(argv[0]))
  return 'ok'
}`

export const appleNotes: NotesSource = {
  async list(folder) {
    return JSON.parse(await jxa(LIST, [folder]))
  },
  async read(id) {
    const raw = JSON.parse(await jxa(READ, [id]))
    return { ...raw, created: new Date(raw.created), modified: new Date(raw.modified) } as AppleNote
  },
  async saveAttachment(noteId, index, dir) {
    await mkdir(dir, { recursive: true })
    const path = await jxa(SAVE_ATTACHMENT, [noteId, String(index), dir])
    return path && existsSync(path) ? path : null
  },
  async modified(id) {
    const iso = await jxa(MODIFIED, [id])
    return iso ? new Date(iso) : null
  },
  async delete(id) {
    await jxa(DELETE, [id])
  },
}

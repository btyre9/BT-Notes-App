import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { importNotes, type AppleNote, type NotesSource } from './importer.ts'

// A 1×1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

let root: string
let scratch: string

/** An Apple Notes stand-in: notes in one folder, attachments as file contents (null can't be exported). */
function fakeNotes(notes: (AppleNote & { files?: ({ name: string; data: Buffer } | null)[] })[], folder = 'Capture') {
  const deleted: string[] = []
  const source: NotesSource = {
    async list(name) {
      return name === folder ? notes.filter((n) => !deleted.includes(n.id)).map((n) => n.id) : null
    },
    async read(id) {
      return notes.find((n) => n.id === id)!
    },
    async saveAttachment(id, index, dir) {
      const file = notes.find((n) => n.id === id)!.files?.[index]
      if (!file) return null
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, file.name), file.data)
      return join(dir, file.name)
    },
    async modified(id) {
      return notes.find((n) => n.id === id)?.modified ?? null
    },
    async delete(id) {
      deleted.push(id)
    },
  }
  return { source, deleted }
}

const note = (over: Partial<AppleNote & { files: ({ name: string; data: Buffer } | null)[] }> = {}) => ({
  id: 'x-coredata://A/ICNote/p1',
  name: 'Groceries',
  created: new Date(2026, 9, 20, 9, 14, 0),
  modified: new Date(2026, 9, 20, 9, 15, 30),
  body: '<div><b><span style="font-size: 24px">Groceries</span></b></div>\n<div>Milk #shopping</div>\n',
  locked: false,
  attachmentCount: 0,
  ...over,
})

const read = (rel: string) => readFileSync(join(root, rel), 'utf8')

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'bt-import-test-'))
  root = join(scratch, 'BT Notes')
  mkdirSync(root)
})
afterEach(() => rmSync(scratch, { recursive: true, force: true }))

describe('importNotes', () => {
  it('writes the note to Inbox/ and then deletes it from Apple Notes', async () => {
    const { source, deleted } = fakeNotes([note()])
    const results = await importNotes(root, source)
    expect(results).toEqual([{ name: 'Groceries', path: 'Inbox/Groceries.md', status: 'imported', deleted: true }])
    expect(read('Inbox/Groceries.md')).toBe(
      '---\ncreated: 2026-10-20T09:14:00\npinned: false\nsource: apple-notes\nappleNotesId: x-coredata://A/ICNote/p1\nappleNotesModified: 2026-10-20T09:15:30\n---\n# Groceries\n\nMilk #shopping\n',
    )
    expect(deleted).toEqual(['x-coredata://A/ICNote/p1'])
  })

  it('returns null when Apple Notes has no such folder', async () => {
    expect(await importNotes(root, fakeNotes([note()]).source, { folder: 'Nope' })).toBeNull()
  })

  it('saves attachments into Attachments/ where Notes marks them, named after the note', async () => {
    const { source, deleted } = fakeNotes([
      note({
        body: '<div>Groceries</div><div><br><br></div><div>after</div>',
        attachmentCount: 1,
        files: [{ name: '012C8A36-A532-45B9-B879-549862B090BB', data: PNG }],
      }),
    ])
    await importNotes(root, source)
    expect(read('Attachments/Groceries.png')).toBe(PNG.toString('utf8'))
    expect(read('Inbox/Groceries.md')).toContain('# Groceries\n\n![](Attachments/Groceries.png)\nafter\n')
    expect(deleted).toHaveLength(1)
  })

  it('appends attachments at the end when the markers do not match up, keeping their names', async () => {
    const { source } = fakeNotes([
      note({ body: '<div>Groceries</div><div>list</div>', attachmentCount: 1, files: [{ name: 'Call Recording.m4a', data: Buffer.from('m4a') }] }),
    ])
    await importNotes(root, source)
    expect(read('Inbox/Groceries.md')).toContain('list\n\n[Call Recording](Attachments/Call%20Recording.m4a)\n')
    expect(existsSync(join(root, 'Attachments/Call Recording.m4a'))).toBe(true)
  })

  it('saves images embedded in the body', async () => {
    const { source } = fakeNotes([note({ body: `<div>Groceries</div><div><img src="data:image/png;base64,${PNG.toString('base64')}"/></div>` })])
    await importNotes(root, source)
    expect(readFileSync(join(root, 'Attachments/Groceries.png')).equals(PNG)).toBe(true)
    expect(read('Inbox/Groceries.md')).toContain('![](Attachments/Groceries.png)')
  })

  it('keeps a note in Apple Notes when an attachment cannot be exported', async () => {
    const { source, deleted } = fakeNotes([note({ body: '<div>Groceries</div><div><br><br></div>', attachmentCount: 1, files: [null] })])
    const [result] = (await importNotes(root, source))!
    expect(result.status).toBe('imported')
    expect(result.deleted).toBe(false)
    expect(result.reason).toMatch(/couldn't export attachment 1/)
    expect(deleted).toEqual([])
  })

  it('keeps a note in Apple Notes when it was edited during the import', async () => {
    const n = note()
    const { source, deleted } = fakeNotes([n])
    source.modified = async () => new Date(n.modified.getTime() + 1000)
    const [result] = (await importNotes(root, source))!
    expect(result.deleted).toBe(false)
    expect(result.reason).toMatch(/edited/)
    expect(deleted).toEqual([])
  })

  it('does not import the same version of a note twice, even after it was filed elsewhere', async () => {
    const first = fakeNotes([note()])
    await importNotes(root, first.source, { keep: true })
    mkdirSync(join(root, 'Notes'))
    writeFileSync(join(root, 'Notes/Groceries.md'), read('Inbox/Groceries.md'))
    rmSync(join(root, 'Inbox/Groceries.md'))

    const again = fakeNotes([note()])
    const [result] = (await importNotes(root, again.source))!
    expect(result).toMatchObject({ status: 'already-imported', path: 'Notes/Groceries.md', deleted: true })
    expect(readdirSync(join(root, 'Inbox'))).toEqual([])
  })

  it('imports an edited version as a new file next to the old one', async () => {
    await importNotes(root, fakeNotes([note()]).source, { keep: true })
    const [result] = (await importNotes(root, fakeNotes([note({ modified: new Date(2026, 9, 21) })]).source))!
    expect(result).toMatchObject({ status: 'imported', path: 'Inbox/Groceries 2.md' })
  })

  it('skips locked notes', async () => {
    const { source, deleted } = fakeNotes([note({ locked: true, body: '' })])
    expect((await importNotes(root, source))![0]).toMatchObject({ status: 'skipped', reason: 'locked with a password' })
    expect(deleted).toEqual([])
  })

  it('writes and deletes nothing in a dry run', async () => {
    const { source, deleted } = fakeNotes([note()])
    expect((await importNotes(root, source, { dryRun: true }))![0]).toMatchObject({ status: 'imported', path: 'Inbox/Groceries.md' })
    expect(existsSync(join(root, 'Inbox'))).toBe(false)
    expect(deleted).toEqual([])
  })

  it('names an untitled note after when it was captured', async () => {
    const { source } = fakeNotes([note({ name: '', body: '<div>just text</div>' })])
    const [result] = (await importNotes(root, source))!
    expect(result.path).toBe('Inbox/Capture 2026-10-20 09.14.md')
    expect(read(result.path!)).toContain('# Capture 2026-10-20 09.14\n\njust text\n')
  })
})

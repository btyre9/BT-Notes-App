import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Vault } from './vault'

let root: string
let vault: Vault
const file = (rel: string) => join(root, rel)
const put = (rel: string, content: string) => {
  mkdirSync(join(file(rel), '..'), { recursive: true })
  writeFileSync(file(rel), content)
}

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'bt-notes-'))
  put('Notes/Untitled.md', '# ')
  vault = new Vault(root, () => {})
  await vault.loadAll()
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('Vault.save', () => {
  it('overwrites a note the app loaded', () => {
    expect(vault.save({ path: 'Notes/Untitled.md', content: '# Draft' })).toBe('Notes/Untitled.md')
    expect(readFileSync(file('Notes/Untitled.md'), 'utf8')).toBe('# Draft')
  })

  it('never renames onto a file synced in from another device', () => {
    put('Notes/Groceries.md', 'OTHER DEVICE NOTE')
    const path = vault.save({ renameFrom: 'Notes/Untitled.md', path: 'Notes/Groceries.md', content: '# Groceries' })
    expect(path).toBe('Notes/Groceries 2.md')
    expect(readFileSync(file('Notes/Groceries.md'), 'utf8')).toBe('OTHER DEVICE NOTE')
    expect(readFileSync(file(path), 'utf8')).toBe('# Groceries')
    expect(existsSync(file('Notes/Untitled.md'))).toBe(false)
  })

  it('never creates a new note on top of a file it has not loaded', () => {
    put('Notes/Ideas.md', 'OTHER DEVICE NOTE')
    expect(vault.save({ path: 'Notes/Ideas.md', content: '# Ideas' })).toBe('Notes/Ideas 2.md')
    expect(readFileSync(file('Notes/Ideas.md'), 'utf8')).toBe('OTHER DEVICE NOTE')
  })

  it('still saves when the old file was deleted elsewhere before a rename', () => {
    rmSync(file('Notes/Untitled.md'))
    expect(vault.save({ renameFrom: 'Notes/Untitled.md', path: 'Notes/Plan.md', content: '# Plan' })).toBe('Notes/Plan.md')
    expect(readFileSync(file('Notes/Plan.md'), 'utf8')).toBe('# Plan')
  })

  it('allows a case-only rename', () => {
    const path = vault.save({ renameFrom: 'Notes/Untitled.md', path: 'Notes/untitled.md', content: '# untitled' })
    expect(path).toBe('Notes/untitled.md')
    expect(readFileSync(file(path), 'utf8')).toBe('# untitled')
  })
})

describe('Vault.loadAll', () => {
  it('skips hidden folders, .Trash and Attachments', async () => {
    put('.Trash/Old.md', 'x')
    put('Attachments/readme.md', 'x')
    put('Daily/2026-10-19.md', '# Today')
    const paths = (await vault.loadAll()).map((n) => n.path).sort()
    expect(paths).toEqual(['Daily/2026-10-19.md', 'Notes/Untitled.md'])
  })

  it('loads boards along with notes', async () => {
    put('Boards/Home.canvas', '{"nodes":[],"edges":[]}')
    put('.Trash/Old.canvas', '{}')
    const paths = (await vault.loadAll()).map((n) => n.path).sort()
    expect(paths).toEqual(['Boards/Home.canvas', 'Notes/Untitled.md'])
  })
})

describe('Vault boards and attachments', () => {
  it('gives a new board a free name instead of overwriting one it has not loaded', () => {
    put('Boards/Ideas.canvas', 'OTHER DEVICE BOARD')
    expect(vault.save({ path: 'Boards/Ideas.canvas', content: '{}' })).toBe('Boards/Ideas 2.canvas')
  })

  it('copies attachments under a free, safe name', async () => {
    const data = new Uint8Array([1, 2, 3])
    expect(await vault.addAttachment('photo.jpg', data)).toBe('Attachments/photo.jpg')
    expect(await vault.addAttachment('photo.jpg', data)).toBe('Attachments/photo 2.jpg')
    expect(await vault.addAttachment('..\evil:name?.png', data)).toBe('Attachments/evilname.png')
    expect([...readFileSync(file('Attachments/photo 2.jpg'))]).toEqual([1, 2, 3])
  })

  it('gives files with the same name added at the same time different names', async () => {
    const paths = await Promise.all([1, 2, 3].map((n) => vault.addAttachment('IMG_0001.jpg', new Uint8Array([n]))))
    expect(new Set(paths).size).toBe(3)
    expect(paths.map((p) => readFileSync(file(p))[0]).sort()).toEqual([1, 2, 3])
  })

  it('ignores trashing a board that was never saved', () => {
    expect(() => vault.trash('Boards/Never saved.canvas')).not.toThrow()
  })

  it('moves a trashed board into .Trash', () => {
    put('Boards/Old.canvas', '{}')
    vault.trash('Boards/Old.canvas')
    expect(existsSync(file('.Trash/Old.canvas'))).toBe(true)
  })
})

describe('Vault.importFile', () => {
  it('copies a file from disk into Attachments under a free name', async () => {
    const outside = join(root, '..', `outside-${Date.now()}.mov`)
    writeFileSync(outside, 'VIDEO')
    try {
      expect(await vault.importFile(outside)).toMatch(/^Attachments\/outside-\d+\.mov$/)
      expect(await vault.importFile(outside)).toMatch(/^Attachments\/outside-\d+ 2\.mov$/)
    } finally {
      rmSync(outside)
    }
  })

  it('uses a file that is already in Attachments where it is', async () => {
    put('Attachments/Spec.pdf', 'PDF')
    expect(await vault.importFile(file('Attachments/Spec.pdf'))).toBe('Attachments/Spec.pdf')
    expect(existsSync(file('Attachments/Spec 2.pdf'))).toBe(false)
  })
})

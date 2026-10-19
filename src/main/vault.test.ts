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
})

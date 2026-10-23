import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { defaultRoots } from './notesRoot'

describe('defaultRoots', () => {
  it('looks in each Google Drive account on a Mac first, then iCloud Drive', () => {
    const home = mkdtempSync(join(tmpdir(), 'home-'))
    for (const name of ['GoogleDrive-me@gmail.com', 'Dropbox', 'OneDrive-Personal']) mkdirSync(join(home, 'Library', 'CloudStorage', name), { recursive: true })
    const roots = defaultRoots('darwin', home)
    expect(roots[0]).toBe(join(home, 'Library', 'CloudStorage', 'GoogleDrive-me@gmail.com', 'My Drive', 'BT Notes'))
    expect(roots[1]).toBe(join(home, 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'BT Notes'))
    expect(roots).toHaveLength(4)
  })

  it('looks in the G: drive on Windows first', () => {
    expect(defaultRoots('win32', 'C:\\Users\\me')[0]).toBe('G:\\My Drive\\BT Notes')
  })
})

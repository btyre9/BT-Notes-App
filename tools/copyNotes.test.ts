import { mkdtempSync, mkdirSync, readFileSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyNotes } from './copyNotes'

function folder(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'copy-notes-'))
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

describe('copyNotes', () => {
  it('copies every file, keeps modification times, and leaves out junk', async () => {
    const from = folder({
      'Notes/Project X.md': '# Project X',
      'Boards/Home.canvas': '{}',
      'Attachments/photo.jpg': 'jpg',
      '.Trash/Old.md': '# Old',
      'Notes/._Project X.md': 'mac',
      '.DS_Store': 'mac',
    })
    utimesSync(join(from, 'Notes/Project X.md'), new Date(2026, 0, 2), new Date(2026, 0, 2))
    const to = join(mkdtempSync(join(tmpdir(), 'copy-notes-')), 'BT Notes')

    const report = await copyNotes(from, to)
    expect(report.copied).toEqual(['.Trash/Old.md', 'Attachments/photo.jpg', 'Boards/Home.canvas', 'Notes/Project X.md'])
    expect(report.counts).toEqual({ notes: 2, boards: 1, attachments: 1, other: 0 })
    expect(readFileSync(join(to, 'Notes/Project X.md'), 'utf8')).toBe('# Project X')
    expect(statSync(join(to, 'Notes/Project X.md')).mtime).toEqual(new Date(2026, 0, 2))
    expect(() => statSync(join(to, '.DS_Store'))).toThrow()

    const again = await copyNotes(from, to)
    expect([again.copied, again.same.length]).toEqual([[], 4])
  })

  it('never overwrites a different file, and reports iCloud files that are not downloaded', async () => {
    const from = folder({ 'Notes/A.md': 'new', 'Notes/.B.md.icloud': '' })
    const to = folder({ 'Notes/A.md': 'old' })
    const report = await copyNotes(from, to)
    expect(report.differ).toEqual(['Notes/A.md'])
    expect(report.notDownloaded).toEqual(['Notes/B.md'])
    expect(readFileSync(join(to, 'Notes/A.md'), 'utf8')).toBe('old')
  })

  it('writes nothing on a dry run, and refuses a folder inside the other', async () => {
    const from = folder({ 'Notes/A.md': 'a' })
    const to = join(mkdtempSync(join(tmpdir(), 'copy-notes-')), 'BT Notes')
    expect((await copyNotes(from, to, { dryRun: true })).copied).toEqual(['Notes/A.md'])
    expect(() => statSync(to)).toThrow()
    await expect(copyNotes(from, join(from, 'Copy'))).rejects.toThrow('inside')
  })
})

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { INTERVAL_SECONDS, LABEL, plist } from './schedule.ts'

describe('plist', () => {
  const text = plist('/opt/node', '/Users/me/BT Notes & Co/mac/import-apple-notes.ts', '/Users/me/Library/Logs/BT Notes/import.log', {
    BT_NOTES_ROOT: '/Users/me/<test>',
  })

  it('runs the importer quietly on an interval, with the notes folder passed on', () => {
    expect(text).toContain(`<string>${LABEL}</string>`)
    expect(text).toContain('<string>/Users/me/BT Notes &amp; Co/mac/import-apple-notes.ts</string>\n    <string>--quiet</string>')
    expect(text).toContain(`<integer>${INTERVAL_SECONDS}</integer>`)
    expect(text).toContain('<key>BT_NOTES_ROOT</key>\n    <string>/Users/me/&lt;test&gt;</string>')
  })

  it.runIf(process.platform === 'darwin')('is a valid property list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bt-plist-'))
    try {
      writeFileSync(join(dir, 'job.plist'), text)
      expect(() => execFileSync('plutil', ['-lint', join(dir, 'job.plist')], { stdio: 'pipe' })).not.toThrow()
      writeFileSync(join(dir, 'bare.plist'), plist('/opt/node', '/x.ts', '/log', {}))
      expect(() => execFileSync('plutil', ['-lint', join(dir, 'bare.plist')], { stdio: 'pipe' })).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

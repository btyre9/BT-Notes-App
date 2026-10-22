/**
 * Moves the notes in the Apple Notes folder "Capture" into the BT Notes Inbox/ folder.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON mac/import-apple-notes.ts [--keep] [--dry-run] [--folder Name] [--quiet]
 *
 *   --keep      import, but leave the notes in Apple Notes
 *   --dry-run   show what would be imported; write and delete nothing
 *   --folder    the Apple Notes folder to import from (default: Capture)
 *   --quiet     print nothing when there's nothing to import (for the scheduled run)
 *
 * The notes folder is BT_NOTES_ROOT if set, else the workspace chosen for captures in the app
 * (at first, the first workspace), else iCloud Drive's BT Notes folder.
 */
import { closeSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { captureRoot } from '../src/shared/notesRoot.ts'
import { appleNotes } from './appleNotes.ts'
import { importNotes, localTimestamp } from './importer.ts'

if (process.platform !== 'darwin') {
  console.error('The Apple Notes importer runs on a Mac.')
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    folder: { type: 'string', default: 'Capture' },
    quiet: { type: 'boolean', default: false },
  },
})

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Takes the lock that keeps two imports, such as the scheduled one and one run by hand, from
 * importing the same notes at once. A lock left by an import that crashed is taken over.
 */
function lock(): boolean {
  const file = join(tmpdir(), 'bt-notes-import.lock')
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx')
      writeSync(fd, String(process.pid))
      closeSync(fd)
      process.on('exit', () => rmSync(file, { force: true }))
      return true
    } catch {
      let pid = 0
      try {
        pid = Number(readFileSync(file, 'utf8'))
      } catch {
        // The other import just finished and removed it.
      }
      if (pid && isRunning(pid)) return false
      rmSync(file, { force: true })
    }
  }
  return false
}

const dryRun = values['dry-run']
if (!dryRun && !lock()) {
  if (!values.quiet) console.log('Another import is running.')
  process.exit(0)
}

const root = captureRoot()
const folder = values.folder!
const results = await importNotes(root, appleNotes, { folder, keep: values.keep, dryRun })

if (results === null) {
  console.error(`Apple Notes has no folder named "${folder}".`)
  process.exit(1)
}
if (!(values.quiet && !results.length)) {
  const stamp = values.quiet ? `${localTimestamp(new Date()).replace('T', ' ')}  ` : ''
  console.log(`${stamp}${dryRun ? 'Dry run: ' : ''}${results.length} note${results.length === 1 ? '' : 's'} in "${folder}" → ${root}`)
  for (const r of results) {
    const what = {
      imported: dryRun ? 'Would import' : 'Imported',
      'already-imported': 'Already imported',
      duplicate: 'Duplicate of',
      skipped: 'Skipped',
      failed: 'Failed',
    }[r.status]
    const line = r.status === 'duplicate' ? `${what} ${r.path}: ${r.name}` : `${what}: ${r.name}${r.path ? ` → ${r.path}` : ''}`
    const removed = r.deleted ? ', removed from Apple Notes' : ''
    console.log(`  ${line}${removed}${r.reason && r.reason !== 'dry run' ? ` (${r.reason})` : ''}`)
  }
}
process.exitCode = results.some((r) => r.status === 'failed') ? 1 : 0

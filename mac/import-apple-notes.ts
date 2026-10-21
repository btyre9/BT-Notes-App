/**
 * Moves the notes in the Apple Notes folder "Capture" into the BT Notes Inbox/ folder.
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON mac/import-apple-notes.ts [--keep] [--dry-run] [--folder Name]
 *
 *   --keep      import, but leave the notes in Apple Notes
 *   --dry-run   show what would be imported; write and delete nothing
 *   --folder    the Apple Notes folder to import from (default: Capture)
 *
 * The notes folder is BT_NOTES_ROOT if set, else the folder the app last opened, else Dropbox's
 * BT Notes folder.
 */
import { parseArgs } from 'node:util'
import { notesRoot } from '../src/shared/notesRoot.ts'
import { appleNotes } from './appleNotes.ts'
import { importNotes } from './importer.ts'

if (process.platform !== 'darwin') {
  console.error('The Apple Notes importer runs on a Mac.')
  process.exit(1)
}

const { values } = parseArgs({
  options: {
    keep: { type: 'boolean', default: false },
    'dry-run': { type: 'boolean', default: false },
    folder: { type: 'string', default: 'Capture' },
  },
})

const root = notesRoot()
const folder = values.folder!
const results = await importNotes(root, appleNotes, { folder, keep: values.keep, dryRun: values['dry-run'] })

if (results === null) {
  console.error(`Apple Notes has no folder named "${folder}".`)
  process.exit(1)
}
console.log(`${values['dry-run'] ? 'Dry run: ' : ''}${results.length} note${results.length === 1 ? '' : 's'} in "${folder}" → ${root}`)
for (const r of results) {
  const what = { imported: values['dry-run'] ? 'Would import' : 'Imported', 'already-imported': 'Already imported', skipped: 'Skipped', failed: 'Failed' }[r.status]
  const where = r.path ? ` → ${r.path}` : ''
  const removed = r.deleted ? ', removed from Apple Notes' : ''
  console.log(`  ${what}: ${r.name}${where}${removed}${r.reason && r.reason !== 'dry run' ? ` (${r.reason})` : ''}`)
}
process.exitCode = results.some((r) => r.status === 'failed') ? 1 : 0

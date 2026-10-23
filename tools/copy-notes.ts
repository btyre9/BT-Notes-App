/**
 * Copies the notes folder into another one and checks every file, for moving it to Google Drive
 * (PLAN.md phase 13).
 *
 *   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/copy-notes.ts [--from Folder] [--dry-run] Destination
 *
 *   --from      the folder to copy (default: the workspace open in the app)
 *   --dry-run   show what would be copied; write nothing
 *
 * Nothing at the destination is overwritten, and the source is left as it was.
 */
import { parseArgs } from 'node:util'
import { notesRoot } from '../src/shared/notesRoot.ts'
import { copyNotes } from './copyNotes.ts'

const { values, positionals } = parseArgs({
  options: { from: { type: 'string' }, 'dry-run': { type: 'boolean' } },
  allowPositionals: true,
})
if (positionals.length !== 1) {
  console.error('Usage: npm run copy-notes -- [--from Folder] [--dry-run] Destination')
  process.exit(2)
}
const from = values.from ?? notesRoot()
const to = positionals[0]
const dryRun = values['dry-run'] ?? false

console.log(`${dryRun ? 'Would copy' : 'Copying'} ${from}\n  into ${to}\n`)
const report = await copyNotes(from, to, { dryRun })
const { notes, boards, attachments, other } = report.counts
console.log(`${report.copied.length} ${dryRun ? 'to copy' : 'copied and checked'}, ${report.same.length} already there and the same.`)
console.log(`${notes} notes, ${boards} boards, ${attachments} attachments, ${other} other files.`)

const problems: [string, string[]][] = [
  ['Already at the destination but different (left as they were):', report.differ],
  ["Only in iCloud, not downloaded to this Mac (right-click BT Notes in Finder, choose Keep Downloaded, and run this again):", report.notDownloaded],
  ["Copied but didn't read back the same:", report.failed],
]
for (const [heading, paths] of problems) {
  if (!paths.length) continue
  console.log(`\n${heading}`)
  for (const path of paths) console.log(`  ${path}`)
}
if (problems.some(([, paths]) => paths.length)) process.exit(1)
console.log(dryRun ? '\nNothing was written.' : '\nEvery file is in the new folder, byte for byte.')

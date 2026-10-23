/**
 * Copies a notes folder into another, such as from iCloud Drive into Google Drive (PLAN.md phase
 * 13), and checks every file byte for byte. It never overwrites: a file already at the
 * destination is left alone, and reported if it differs. Modification times are kept, since the
 * note list sorts by them. Node only.
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import * as fs from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'

/** Files the Mac, Windows and sync services make for themselves, which don't belong in the copy. */
const JUNK = new Set(['.DS_Store', 'desktop.ini', 'Thumbs.db', 'Icon\r', '.dropbox', '.dropbox.attr'])

export interface CopyReport {
  /** Paths relative to the folder, with forward slashes. */
  copied: string[]
  /** Already at the destination, with the same bytes. */
  same: string[]
  /** Already at the destination with different bytes; left as they were. */
  differ: string[]
  /** iCloud Drive files that are still only in the cloud, so they can't be read here. */
  notDownloaded: string[]
  /** Files whose copy didn't read back the same. */
  failed: string[]
  /** What the destination holds afterwards, from the source's files. */
  counts: { notes: number; boards: number; attachments: number; other: number }
}

export async function copyNotes(from: string, to: string, options: { dryRun?: boolean } = {}): Promise<CopyReport> {
  from = resolve(from)
  to = resolve(to)
  if (inside(to, from) || inside(from, to)) throw new Error('One folder is inside the other')
  if (!(await fs.stat(from).catch(() => null))?.isDirectory()) throw new Error(`No folder at ${from}`)

  const report: CopyReport = { copied: [], same: [], differ: [], notDownloaded: [], failed: [], counts: { notes: 0, boards: 0, attachments: 0, other: 0 } }
  for (const path of await files(from)) {
    const name = path.split('/').pop()!
    // Older macOS versions show an iCloud file that isn't downloaded as ".Name.icloud".
    if (name.startsWith('.') && name.endsWith('.icloud')) {
      report.notDownloaded.push(join(dirname(path), name.slice(1, -'.icloud'.length)).split(sep).join('/'))
      continue
    }
    const source = join(from, path)
    const target = join(to, path)
    const existing = await fs.stat(target).catch(() => null)
    if (existing) {
      const list = (await sameBytes(source, target)) ? report.same : report.differ
      list.push(path)
    } else if (options.dryRun) {
      report.copied.push(path)
    } else {
      const stat = await fs.stat(source)
      await fs.mkdir(dirname(target), { recursive: true })
      await fs.copyFile(source, target)
      await fs.utimes(target, stat.atime, stat.mtime)
      const list = (await sameBytes(source, target)) ? report.copied : report.failed
      list.push(path)
    }
    report.counts[kind(path)]++
  }
  return report
}

/** Every file under a folder, as relative paths with forward slashes, in a stable order. */
async function files(root: string): Promise<string[]> {
  const out: string[] = []
  const walk = async (dir: string) => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (JUNK.has(entry.name) || entry.name.startsWith('._')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'))
    }
  }
  await walk(root)
  return out.sort()
}

function kind(path: string): keyof CopyReport['counts'] {
  if (path.startsWith('Attachments/')) return 'attachments'
  if (path.endsWith('.md')) return 'notes'
  if (path.endsWith('.canvas')) return 'boards'
  return 'other'
}

function inside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel))
}

async function sameBytes(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([fs.stat(a), fs.stat(b)])
  return sa.size === sb.size && (await sha256(a)) === (await sha256(b))
}

function sha256(path: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', fail)
      .on('end', () => done(hash.digest('hex')))
  })
}

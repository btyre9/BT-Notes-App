import type { NoteFile } from '../../../shared/types'

export interface Note {
  /** Stable for the session, unlike `path`, which changes when the title changes. */
  id: string
  path: string
  /** Raw front matter block including its `---` lines, or ''. The editor only shows `body`. */
  frontmatter: string
  body: string
  mtime: number
  title: string
  tags: string[]
  /** Targets of `[[links]]` in the note, without aliases. */
  links: string[]
  tasks: Task[]
  pinned: boolean
  snippet: string
}

export interface Task {
  /** 0-based line number in the body. */
  line: number
  text: string
  done: boolean
  /** `YYYY-MM-DD` from a `📅 2026-10-21` marker. */
  due?: string
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/
/** Bear-style tags: `#tag` or `#parent/child` at the start of a word. */
export const TAG_PATTERN = /(?<=^|\s)#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu
/** `[[Target]]` or `[[Target|shown text]]`. */
export const WIKILINK_PATTERN = /\[\[([^[\]\n|]+)(?:\|([^[\]\n]+))?\]\]/g
export const DUE_PATTERN = /📅\s*(\d{4}-\d{2}-\d{2})/u
/** A task line, also inside a quote or callout (`> - [ ] …`). */
export const TASK_LINE = /^\s*(?:>\s*)*[-*+] \[([ xX])\] (.*)$/
/** Characters that would break the `[[name]]` syntax if they were part of the name. */
const UNLINKABLE = /[[\]|]/
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i

export const DAILY_DIR = 'Daily/'

export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(FRONTMATTER)
  return match ? { frontmatter: match[0], body: content.slice(match[0].length) } : { frontmatter: '', body: content }
}

export function frontmatterValue(frontmatter: string, key: string): string | undefined {
  return frontmatter.match(new RegExp(`^${key}:[ \\t]*(.*?)\\s*$`, 'm'))?.[1]
}

export function setFrontmatterValue(frontmatter: string, key: string, value: string): string {
  const line = `${key}: ${value}`
  if (!frontmatter) return `---\n${line}\n---\n`
  const existing = new RegExp(`^${key}:.*$`, 'm')
  if (existing.test(frontmatter)) return frontmatter.replace(existing, line)
  return frontmatter.replace(/\r?\n---(\r?\n)?$/, `\n${line}$&`)
}

/** The first non-empty line, without heading marks. */
export function titleOf(body: string): string {
  for (const line of body.split('\n')) {
    const text = line.replace(/^#{1,6}\s+/, '').trim()
    if (text) return text
  }
  return ''
}

function withoutCode(text: string): string {
  return text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '')
}

export function tagsOf(body: string): string[] {
  const tags = new Set<string>()
  for (const match of withoutCode(body).matchAll(TAG_PATTERN)) tags.add(match[0].slice(1).toLowerCase())
  return [...tags].sort()
}

export function linksOf(body: string): string[] {
  const targets = new Set<string>()
  for (const match of withoutCode(body).matchAll(WIKILINK_PATTERN)) targets.add(match[1].trim())
  return [...targets]
}

export function tasksOf(body: string): Task[] {
  const tasks: Task[] = []
  // Files written on Windows can end lines with \r\n.
  body.split(/\r?\n/).forEach((line, i) => {
    const match = TASK_LINE.exec(line)
    if (!match) return
    const due = DUE_PATTERN.exec(match[2])?.[1]
    tasks.push({ line: i, text: match[2].replace(DUE_PATTERN, '').trim(), done: match[1] !== ' ', due })
  })
  return tasks
}

/** True if `name` can sit inside `[[…]]` without breaking the link syntax. */
export function isLinkable(name: string): boolean {
  return name !== '' && !UNLINKABLE.test(name)
}

const CODE_OR_LINK = new RegExp(`(\`\`\`[\\s\\S]*?\`\`\`|\`[^\`\\n]*\`)|${WIKILINK_PATTERN.source}`, 'g')

/** Points every `[[old name]]` (any case, alias kept) at `newName`, leaving code untouched. */
export function rewriteLinks(body: string, oldNames: string[], newName: string): string {
  const old = new Set(oldNames.map((n) => n.toLowerCase()))
  return body.replace(CODE_OR_LINK, (match, code?: string, target?: string, alias?: string) =>
    !code && target && old.has(target.trim().toLowerCase()) ? `[[${newName}${alias ? `|${alias}` : ''}]]` : match,
  )
}

/** One line of Markdown as readable text: links show their label, formatting marks are dropped. */
export function plainLine(line: string): string {
  return line
    .replace(WIKILINK_PATTERN, (_m, target: string, alias?: string) => (alias ?? target).trim())
    .replace(/^\s*(?:[-*+] (?:\[[ xX]\] )?|\d+[.)] |>\s*(?:\[!\w+\][+-]?\s*)?|#{1,6} )/, '')
    .replace(/\*\*|__|~~|`/g, '')
    .trim()
}

/** File name without folder or `.md`. */
export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.md$/i, '')
}

/** Local date as `YYYY-MM-DD`. */
export function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function dailyPath(date: Date): string {
  return `${DAILY_DIR}${isoDate(date)}.md`
}

export function dailyTitle(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function snippetOf(body: string, title: string): string {
  const afterTitle = body.slice(body.indexOf(title) + title.length)
  return afterTitle
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[!\w+\][+-]?/g, ' ')
    .replace(/^\s*[-*+] \[[ xX]\] /gm, ' ')
    .replace(/[#>*_`~[\]|]+|^\s*[-+] /gm, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160)
}

export function buildNote(id: string, path: string, frontmatter: string, body: string, mtime: number): Note {
  const title = titleOf(body)
  return {
    id,
    path,
    frontmatter,
    body,
    mtime,
    title,
    tags: tagsOf(body),
    links: linksOf(body),
    tasks: tasksOf(body),
    pinned: frontmatterValue(frontmatter, 'pinned') === 'true',
    snippet: snippetOf(body, title),
  }
}

export function parseNote(id: string, file: NoteFile): Note {
  const { frontmatter, body } = splitFrontmatter(file.content)
  return buildNote(id, file.path, frontmatter, body, file.mtime)
}

export function contentOf(note: Pick<Note, 'frontmatter' | 'body'>): string {
  return note.frontmatter + note.body
}

/** A file name (without .md) that is safe on Windows, macOS and Google Drive. */
export function fileNameFor(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ')
  // Cut by whole characters so an emoji is never split in half. Leading dots would hide the
  // file (the app skips dot-files); trailing dots and spaces aren't allowed on Windows.
  const name = Array.from(cleaned)
    .slice(0, 80)
    .join('')
    .replace(/^[. ]+|[. ]+$/g, '')
  if (!name) return 'Untitled'
  return RESERVED_WINDOWS_NAMES.test(name) ? `${name} note` : name
}

export interface TagNode {
  name: string
  tag: string
  count: number
  children: TagNode[]
}

/** Nested tag tree; a parent's count includes notes tagged with any of its children. */
export function buildTagTree(notes: Iterable<Note>): TagNode[] {
  const counts = new Map<string, number>()
  for (const note of notes) {
    const prefixes = new Set<string>()
    for (const tag of note.tags) {
      const parts = tag.split('/')
      for (let i = 1; i <= parts.length; i++) prefixes.add(parts.slice(0, i).join('/'))
    }
    for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1)
  }
  const roots: TagNode[] = []
  const byTag = new Map<string, TagNode>()
  for (const tag of [...counts.keys()].sort()) {
    const slash = tag.lastIndexOf('/')
    const node: TagNode = { name: tag.slice(slash + 1), tag, count: counts.get(tag)!, children: [] }
    byTag.set(tag, node)
    if (slash === -1) roots.push(node)
    else byTag.get(tag.slice(0, slash))!.children.push(node)
  }
  return roots
}

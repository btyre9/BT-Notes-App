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
  pinned: boolean
  hasOpenTasks: boolean
  snippet: string
}

const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/
const OPEN_TASK = /^\s*[-*+] \[ \]/m
/** Bear-style tags: `#tag` or `#parent/child` at the start of a word. */
export const TAG_PATTERN = /(?<=^|\s)#[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*/gu
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i

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

function snippetOf(body: string, title: string): string {
  const afterTitle = body.slice(body.indexOf(title) + title.length)
  return afterTitle
    .replace(/```[\s\S]*?```/g, ' ')
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
    pinned: frontmatterValue(frontmatter, 'pinned') === 'true',
    hasOpenTasks: OPEN_TASK.test(body),
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

/**
 * Image links in notes: Markdown's `![](Attachments/My%20photo.png)` and Obsidian's
 * `![[Attachments/My photo.png]]` (optionally `![[photo.png|300]]` for a width in pixels).
 */
export interface ImageLink {
  /** Where the link starts and ends in its line. */
  from: number
  to: number
  /** The link target as written. Markdown targets are %-encoded; Obsidian's aren't. */
  src: string
  encoded: boolean
  alt: string
  width?: number
}

export const IMAGE_FILE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|heic|heif|tiff?)$/i
/** Formats the window can draw itself; the rest go through the operating system's previews. */
const SHOWN_DIRECTLY = /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i

// The target is `<anything>` or a run without spaces that may contain balanced parentheses,
// optionally followed by a "title".
const MARKDOWN_IMAGE =
  /!\[([^\]\n]*)\]\(\s*(<[^<>\n]*>|[^\s()<>]*(?:\([^\s()]*\)[^\s()<>]*)*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g
const EMBED = /!\[\[([^[\]\n|]+)(?:\|([^[\]\n]*))?\]\]/g

/** The image links in a line of Markdown, in order. Links to files that aren't images are left out. */
export function imageLinks(text: string): ImageLink[] {
  const links: ImageLink[] = []
  for (const match of text.matchAll(MARKDOWN_IMAGE)) {
    const src = match[2].replace(/^<|>$/g, '')
    if (!IMAGE_FILE.test(src.replace(/[?#].*$/, ''))) continue
    links.push({ from: match.index, to: match.index + match[0].length, src, encoded: true, alt: match[1] })
  }
  for (const match of text.matchAll(EMBED)) {
    const src = match[1].trim()
    if (!IMAGE_FILE.test(src)) continue
    const width = /^\s*(\d+)(?:x\d+)?\s*$/.exec(match[2] ?? '')
    links.push({
      from: match.index,
      to: match.index + match[0].length,
      src,
      encoded: false,
      alt: width ? '' : (match[2]?.trim() ?? ''),
      width: width ? Number(width[1]) : undefined,
    })
  }
  return links.sort((a, b) => a.from - b.from)
}

/** Whether a line holds nothing but image links (and spaces). */
export function onlyImages(text: string, links: ImageLink[]): boolean {
  let rest = ''
  let at = 0
  for (const link of links) {
    rest += text.slice(at, link.from)
    at = link.to
  }
  return links.length > 0 && !(rest + text.slice(at)).trim()
}

/**
 * The notes-folder path an image link points to, or null for web addresses and paths that leave
 * the folder. Paths are relative to the notes folder, except `./` and `../` ones, which are
 * relative to the note's own folder.
 */
export function imagePath(link: Pick<ImageLink, 'src' | 'encoded'>, notePath: string | null): string | null {
  let path = link.src.trim()
  // `http:`, `file:`, `data:`… and Windows drive letters.
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return null
  if (link.encoded) {
    path = path.replace(/[?#].*$/, '')
    try {
      path = decodeURIComponent(path)
    } catch {
      // A stray `%` that isn't an escape: use the path as written.
    }
  }
  const parts = /^\.\.?\//.test(path) && notePath ? notePath.split('/').slice(0, -1) : []
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue
    if (part !== '..') parts.push(part)
    else if (!parts.pop()) return null
  }
  return parts.length ? parts.join('/') : null
}

/** The `btfile:` URL the window loads an image in the notes folder from. */
export function imageUrl(path: string): string {
  const url = path.split('/').map(encodeURIComponent).join('/')
  return SHOWN_DIRECTLY.test(path) ? `btfile://file/${url}` : `btfile://thumb/${url}?w=800`
}

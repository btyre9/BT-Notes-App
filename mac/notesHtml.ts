/**
 * Turns the HTML that Apple Notes gives to scripts into Markdown. Notes writes a small, regular
 * subset of HTML: one <div> per line, <b>/<i>/<u>/<strike>/<tt> for styles, <h1>-<h3> or a bold
 * <span> with a large font size for headings, <ul>/<ol> for lists, <table> for tables, and <img>
 * with a data: URI for some images. Other images and files are attachments that the body only
 * marks with an empty <div><br><br></div>.
 */

type El = { tag: string; attrs: Record<string, string>; children: Node[] }
type Node = El | string

export interface HtmlHooks {
  /** Markdown for an image embedded in the body as a data: URI. */
  image(mime: string, base64: string): string
  /** Markdown for the attachment marked by the nth empty <div><br><br></div>, or null if that div is a plain blank line. */
  attachment(index: number): string | null
}

const VOID = new Set(['br', 'img', 'hr', 'meta', 'input', 'wbr'])
const BLOCK = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'tr', 'blockquote', 'pre', 'object', 'hr'])
const TOKEN = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|[^<]+|</g
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return n === 0xa0 ? ' ' : String.fromCodePoint(n)
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  }).replace(/ /g, ' ')
}

function parse(html: string): Node[] {
  const root: El = { tag: '#root', attrs: {}, children: [] }
  const stack: El[] = [root]
  for (const m of html.matchAll(TOKEN)) {
    const [token, closing, rawTag, rawAttrs] = m
    const top = stack[stack.length - 1]
    if (token.startsWith('<!--')) continue
    if (!rawTag) {
      top.children.push(decode(token))
      continue
    }
    const tag = rawTag.toLowerCase()
    if (closing) {
      // Close the nearest matching element; a stray closing tag is ignored.
      const at = stack.map((el) => el.tag).lastIndexOf(tag)
      if (at > 0) stack.length = at
      continue
    }
    const attrs: Record<string, string> = {}
    for (const a of (rawAttrs ?? '').matchAll(ATTR)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '')
    const el: El = { tag, attrs, children: [] }
    top.children.push(el)
    if (!VOID.has(tag) && !rawAttrs?.trimEnd().endsWith('/')) stack.push(el)
  }
  return root.children
}

const isEl = (node: Node): node is El => typeof node !== 'string'
/** Children that matter: whitespace between tags is just how Notes lays out its HTML. */
const meaningful = (nodes: Node[]) => nodes.filter((n) => isEl(n) || n.trim() !== '')

function textOf(node: Node): string {
  return isEl(node) ? node.children.map(textOf).join('') : node
}

/** Wraps each line's text in a Markdown marker, keeping spaces outside it so the marker still works. */
function wrap(text: string, marker: string): string {
  return text
    .split('\n')
    .map((line) => {
      const [, lead, inner, trail] = line.match(/^(\s*)([\s\S]*?)(\s*)$/)!
      return inner ? `${lead}${marker}${inner}${marker}${trail}` : line
    })
    .join('\n')
}

/**
 * The heading level of a Notes line styled as Title (24px) or Heading (18px) rather than with
 * <h1>: a line whose whole content is bold text in a large font. Large plain text stays plain.
 */
function styledHeading(el: El): number {
  let bold = false
  let size = 0
  for (let cur = el; ; ) {
    if (cur.tag === 'b' || cur.tag === 'strong') bold = true
    size = Math.max(size, Number(cur.attrs.style?.match(/font-size:\s*(\d+)px/)?.[1] ?? 0))
    const kids = meaningful(cur.children)
    if (kids.length !== 1 || !isEl(kids[0]) || !['b', 'strong', 'font', 'span'].includes(kids[0].tag)) break
    cur = kids[0]
  }
  return !bold ? 0 : size >= 24 ? 1 : size >= 18 ? 2 : 0
}

export function notesHtmlToMarkdown(html: string, hooks: HtmlHooks): string {
  let slot = 0
  let out = ''
  const newline = () => {
    if (out && !out.endsWith('\n')) out += '\n'
  }

  const inline = (nodes: Node[], listDepth: number): string => {
    const saved = out
    out = ''
    nodes.forEach((n) => node(n, listDepth))
    const result = out
    out = saved
    return result
  }

  const node = (n: Node, listDepth: number): void => {
    if (!isEl(n)) {
      // Line breaks in a text node are HTML layout; Notes marks real ones with <br> or a new <div>.
      if (n.includes('\n') && n.trim() === '') return
      out += n.replace(/\s*\n\s*/g, ' ')
      return
    }
    const kids = n.children
    switch (n.tag) {
      case 'br':
        out += '\n'
        return
      case 'b':
      case 'strong':
        out += wrap(inline(kids, listDepth), '**')
        return
      case 'i':
      case 'em':
        out += wrap(inline(kids, listDepth), '*')
        return
      case 'strike':
      case 's':
      case 'del':
        out += wrap(inline(kids, listDepth), '~~')
        return
      case 'tt':
      case 'code':
        out += wrap(textOf(n), '`')
        return
      case 'a': {
        const text = inline(kids, listDepth).trim()
        const href = n.attrs.href ?? ''
        const bare = (url: string) => url.replace(/\/$/, '')
        out += !href ? text : !text || bare(text) === bare(href) ? href : `[${text}](${href})`
        return
      }
      case 'img': {
        const data = n.attrs.src?.match(/^data:([^;,]+);base64,(.*)$/s)
        if (data) out += hooks.image(data[1], data[2].replace(/\s+/g, ''))
        else if (n.attrs.src) out += `![](${n.attrs.src})`
        return
      }
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        newline()
        const text = inline(kids, listDepth).replace(/\s+/g, ' ').trim()
        if (text) out += `${'#'.repeat(Number(n.tag[1]))} ${text}`
        newline()
        return
      }
      case 'ul':
      case 'ol': {
        newline()
        let number = 1
        for (const item of meaningful(kids)) {
          if (!isEl(item) || item.tag !== 'li') {
            // A list nested straight inside a list, without an <li> around it.
            node(item, listDepth + 1)
            continue
          }
          newline()
          const marker = n.tag === 'ol' ? `${number++}. ` : '- '
          const nested = item.children.filter((c) => isEl(c) && (c.tag === 'ul' || c.tag === 'ol'))
          const own = item.children.filter((c) => !nested.includes(c))
          out += '  '.repeat(listDepth) + marker + inline(own, listDepth + 1).replace(/\s+/g, ' ').trim()
          nested.forEach((c) => node(c, listDepth + 1))
          newline()
        }
        // A line straight after a list would join its last item.
        if (listDepth === 0) out += '\n'
        return
      }
      case 'table': {
        // A table needs blank lines around it, or the lines next to it join it.
        newline()
        if (out) out += '\n'
        const rows: string[][] = []
        const collect = (el: El) => {
          for (const c of el.children) {
            if (!isEl(c)) continue
            if (c.tag === 'tr') {
              rows.push(c.children.filter((td): td is El => isEl(td) && (td.tag === 'td' || td.tag === 'th')).map((td) =>
                inline(td.children, 0).trim().replace(/\n+/g, '<br>').replace(/\|/g, '\\|'),
              ))
            } else collect(c)
          }
        }
        collect(n)
        const width = Math.max(0, ...rows.map((r) => r.length))
        if (width) {
          const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`
          out += [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n')
        }
        newline()
        out += '\n'
        return
      }
      case 'div':
      case 'p': {
        newline()
        const content = meaningful(kids)
        // Notes marks where an attachment sits with an otherwise empty <div><br><br></div>.
        if (content.length === 2 && content.every((c) => isEl(c) && c.tag === 'br')) {
          const md = hooks.attachment(slot++)
          if (md !== null) {
            out += md
            newline()
            return
          }
        }
        const level = styledHeading(n)
        if (level) out += `${'#'.repeat(level)} ${textOf(n).replace(/\s+/g, ' ').trim()}`
        else kids.forEach((c) => node(c, listDepth))
        newline()
        return
      }
      default:
        if (BLOCK.has(n.tag)) newline()
        kids.forEach((c) => node(c, listDepth))
        if (BLOCK.has(n.tag)) newline()
    }
  }

  parse(html).forEach((n) => node(n, 0))
  return out
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/^\n+/, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
}

/** How many attachment markers (<div><br><br></div>) a Notes body has. */
export function attachmentSlots(html: string): number {
  return html.match(/<div>\s*<br\s*\/?>\s*<br\s*\/?>\s*<\/div>/gi)?.length ?? 0
}

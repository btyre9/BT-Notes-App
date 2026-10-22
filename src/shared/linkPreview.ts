/**
 * What a web page says about itself for link previews: its title, description, preview image and
 * site name, from the Open Graph and Twitter tags most sites set for sharing. Used by the app
 * (through the main process) and by the MCP server, so link cards look the same however they're
 * made. Node only.
 */

export interface LinkPreview {
  /** The page's address after redirects. */
  url: string
  title?: string
  description?: string
  /** An absolute http(s) address of the preview image. */
  image?: string
  site?: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
      if (code[0] === '#') {
        const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) ? String.fromCodePoint(n) : whole
      }
      return ENTITIES[code.toLowerCase()] ?? whole
    })
    .replace(/\s+/g, ' ')
    .trim()
}

/** Shortens text to a length, at a word if it can. */
function clip(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined
  try {
    const url = new URL(href, base)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** Reads a page's preview details from its HTML. */
export function parseLinkPreview(html: string, pageUrl: string): LinkPreview {
  // Only the head matters, and pages can be large.
  const head = html.slice(0, 300_000)
  const meta = new Map<string, string>()
  for (const tag of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = new Map<string, string>()
    for (const a of tag[0].matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs.set(a[1].toLowerCase(), a[3] ?? a[4] ?? a[5] ?? '')
    }
    const key = (attrs.get('property') ?? attrs.get('name') ?? attrs.get('itemprop'))?.toLowerCase()
    const content = attrs.get('content')
    // The first value wins, as browsers and link unfurlers do.
    if (key && content && !meta.has(key)) meta.set(key, decode(content))
  }
  const first = (...keys: string[]) => keys.map((k) => meta.get(k)).find(Boolean)
  const titleTag = head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return {
    url: pageUrl,
    title: clip(first('og:title', 'twitter:title') ?? (titleTag ? decode(titleTag) : undefined), 200),
    description: clip(first('og:description', 'twitter:description', 'description'), 300),
    image: absolute(first('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image'), pageUrl),
    site: clip(first('og:site_name', 'application-name'), 80),
  }
}

const MAX_HTML = 1_500_000

/** Fetches a page and reads its preview details; null if it can't be fetched or isn't a web page. */
export async function fetchLinkPreview(url: string, timeoutMs = 8000): Promise<LinkPreview | null> {
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        // Some sites only send their sharing tags to browsers and link unfurlers.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) BTNotes/1.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok || !/html/i.test(response.headers.get('content-type') ?? '')) return null
    // Read only as much as the head needs.
    const reader = response.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder()
    let html = ''
    while (html.length < MAX_HTML) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      if (/<\/head>/i.test(html)) break
    }
    void reader.cancel().catch(() => {})
    return parseLinkPreview(html, response.url || url)
  } catch {
    return null
  }
}

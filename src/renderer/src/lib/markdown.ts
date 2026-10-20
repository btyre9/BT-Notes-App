import DOMPurify from 'dompurify'
import { Marked } from 'marked'
import { PRESET_COLORS } from './board'

/**
 * Text cards are Markdown, like Obsidian's: tables, lists, task boxes, and ```mermaid blocks for
 * charts and diagrams. Board files can come from other devices and apps, so the HTML is cleaned
 * before it's shown.
 */

export interface RenderedText {
  html: string
  /** Mermaid sources, in order; each has a `<div data-diagram="i">` placeholder in `html`. */
  diagrams: string[]
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

// Links open in the default browser (the window opens new windows that way), not in the app.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
})

export function renderText(text: string): RenderedText {
  const diagrams: string[] = []
  const marked = new Marked({ gfm: true, breaks: true })
  marked.use({
    renderer: {
      code({ text: source, lang }) {
        // The language is the first word after the fence: ```mermaid, or ```mermaid with a title.
        if (lang?.trim().split(/\s+/)[0].toLowerCase() !== 'mermaid') return false
        diagrams.push(source)
        return `<div data-diagram="${diagrams.length - 1}"><pre>${escape(source)}</pre></div>`
      },
    },
  })
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }), {
    ADD_ATTR: ['target'],
    // Markdown can include raw HTML. A <style> tag, or style, class or id attributes, could restyle
    // or cover the whole app, or pass for one of its own cards, so they're removed.
    FORBID_TAGS: ['style'],
    FORBID_ATTR: ['style', 'class', 'id', 'data-id', 'data-theme'],
  })
  return { html, diagrams }
}

// ---- Mermaid ----

type Mermaid = (typeof import('mermaid'))['default']
let mermaid: Promise<Mermaid> | null = null
let queue: Promise<unknown> = Promise.resolve()
let counter = 0
/** Drawn diagrams by theme and source, so cards that scroll back into view don't redraw. */
const drawn = new Map<string, Promise<string>>()
const CACHE_SIZE = 300
/** The theme Mermaid was last set up for. */
let setUpFor: boolean | null = null

/** Mermaid is large, so it's loaded the first time a board shows a diagram. */
function loadMermaid(): Promise<Mermaid> {
  mermaid ??= import('mermaid').then(({ default: m }) => m)
  return mermaid
}

/** Sets Mermaid up for light or dark mode, in the app's card colors so charts match the board. */
function setUp(m: Mermaid, dark: boolean): void {
  if (setUpFor === dark) return
  setUpFor = dark
  const palette = Object.values(PRESET_COLORS)
  m.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    theme: dark ? 'dark' : 'base',
    fontFamily: getComputedStyle(document.body).fontFamily,
    themeVariables: {
      ...(dark ? {} : { primaryColor: '#f2f2f4', primaryBorderColor: '#9a9aa0', primaryTextColor: '#2d2d2f', lineColor: '#77777b' }),
      ...Object.fromEntries(palette.map((color, i) => [`pie${i + 1}`, color])),
      pieOpacity: '0.85',
      xyChart: { plotColorPalette: palette.join(','), backgroundColor: 'transparent' },
    },
  })
}

/** Draws a Mermaid diagram as SVG. Rejects with Mermaid's message if the source has a mistake. */
export function drawDiagram(source: string, dark: boolean): Promise<string> {
  const key = `${dark ? 'dark' : 'light'}|${source}`
  let svg = drawn.get(key)
  if (!svg) {
    // Mermaid draws one diagram at a time.
    svg = queue.then(async () => {
      const m = await loadMermaid()
      setUp(m, dark)
      const { svg } = await m.render(`diagram-${++counter}`, source)
      return svg
    })
    queue = svg.catch(() => {})
    // A failed source isn't kept, so fixing a typo and changing it back tries again.
    svg.catch(() => drawn.delete(key))
    drawn.set(key, svg)
    // The oldest drawings are dropped once there are many; they're redrawn if needed again.
    if (drawn.size > CACHE_SIZE) drawn.delete(drawn.keys().next().value!)
  }
  return svg
}

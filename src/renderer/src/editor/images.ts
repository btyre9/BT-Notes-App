import { syntaxTree } from '@codemirror/language'
import { StateField, type EditorState, type Range } from '@codemirror/state'
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view'
import { imageLinks, imagePath, imageUrl, onlyImages } from '../lib/images'
import type { EditorContext } from './context'
import { inCode } from './livePreview'

interface Shown {
  path: string
  alt: string
  width?: number
}

/** The images linked from one line, one under the other at most the editor's width. */
class ImagesWidget extends WidgetType {
  constructor(readonly images: Shown[]) {
    super()
  }
  eq(other: ImagesWidget): boolean {
    return (
      other.images.length === this.images.length &&
      other.images.every((image, i) => {
        const mine = this.images[i]
        return image.path === mine.path && image.alt === mine.alt && image.width === mine.width
      })
    )
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('div')
    box.className = 'cm-images'
    for (const { path, alt, width } of this.images) {
      const img = box.appendChild(document.createElement('img'))
      img.src = imageUrl(path)
      img.alt = alt
      img.title = alt || path
      img.draggable = false
      if (width) img.style.width = `${width}px`
      // The line's height changes once the picture arrives; CodeMirror has to measure it again.
      img.addEventListener('load', () => view.requestMeasure())
      img.addEventListener('error', () => {
        const missing = document.createElement('span')
        missing.className = 'cm-image-missing'
        missing.textContent = `Missing image: ${path}`
        img.replaceWith(missing)
        view.requestMeasure()
      })
    }
    // Clicking a picture puts the cursor on its line, which shows the link to edit.
    box.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: view.state.doc.lineAt(view.posAtDOM(box)).to } })
      view.focus()
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

/**
 * A line of nothing but images is replaced by the pictures, except while the cursor is on it.
 * Then, and on lines that also have text, the pictures show below the line.
 */
function buildImages(state: EditorState, ctx: EditorContext): DecorationSet {
  const activeLines = new Set<number>()
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) activeLines.add(n)
  }
  const notePath = ctx.notePath()
  const out: Range<Decoration>[] = []
  for (let n = 1; n <= state.doc.lines; n++) {
    const line = state.doc.line(n)
    if (!line.text.includes('![')) continue
    const links = imageLinks(line.text).filter((link) => !inCode(state, line.from + link.from))
    const shown: Shown[] = []
    for (const link of links) {
      const path = imagePath(link, notePath)
      if (path) shown.push({ path, alt: link.alt, width: link.width })
    }
    if (!shown.length) continue
    const widget = new ImagesWidget(shown)
    const active = activeLines.has(n)
    if (!active && onlyImages(line.text, links)) {
      // Inline rather than a block, so the arrow keys still stop on the line to show the link.
      out.push(Decoration.replace({ widget }).range(line.from, line.to))
      continue
    }
    if (!active) for (const link of links) out.push(Decoration.replace({}).range(line.from + link.from, line.from + link.to))
    out.push(Decoration.widget({ widget, block: true, side: 1 }).range(line.to))
  }
  return Decoration.set(out, true)
}

/** Shows `![](…)` and `![[…]]` images from the notes folder in the note. */
export function imagePreview(ctx: EditorContext) {
  // CodeMirror only takes block widgets from state, not from a view plugin.
  return StateField.define<DecorationSet>({
    create: (state) => buildImages(state, ctx),
    update(images, tr) {
      if (tr.docChanged || tr.selection || syntaxTree(tr.startState) !== syntaxTree(tr.state)) {
        return buildImages(tr.state, ctx)
      }
      return images
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

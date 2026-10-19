import { syntaxTree } from '@codemirror/language'
import type { Range } from '@codemirror/state'
import {
  Decoration,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from '@codemirror/view'
import { TAG_PATTERN } from '../lib/note'

const hide = Decoration.replace({})

class BulletWidget extends WidgetType {
  eq(): boolean {
    return true
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-bullet'
    span.textContent = '•'
    return span
  }
}

class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked
  }
  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'cm-task'
    box.checked = this.checked
    box.addEventListener('mousedown', (event) => {
      // Toggle without moving the cursor onto the line, which would reveal the raw `[ ]`.
      event.preventDefault()
      const pos = view.posAtDOM(box)
      view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: this.checked ? ' ' : 'x' } })
    })
    return box
  }
  ignoreEvent(): boolean {
    return true
  }
}

/** Hides Markdown syntax on every line except the ones the cursor is on, the way Bear does. */
function buildDecorations(view: EditorView): DecorationSet {
  const { state } = view
  const activeLines = new Set<number>()
  for (const range of state.selection.ranges) {
    const last = state.doc.lineAt(range.to).number
    for (let n = state.doc.lineAt(range.from).number; n <= last; n++) activeLines.add(n)
  }
  const isActive = (pos: number) => activeLines.has(state.doc.lineAt(pos).number)
  const lineStart = (pos: number) => state.doc.lineAt(pos).from
  const nextIsSpace = (pos: number) => state.doc.sliceString(pos, pos + 1) === ' '
  const out: Range<Decoration>[] = []

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node) => {
        const heading = /^ATXHeading(\d)$/.exec(node.name)
        if (heading) {
          out.push(Decoration.line({ class: `cm-h${heading[1]}` }).range(lineStart(node.from)))
          return
        }
        if (node.name === 'Blockquote') {
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos)
            out.push(Decoration.line({ class: 'cm-quote' }).range(line.from))
            pos = line.to + 1
          }
          return
        }
        if (node.name === 'Task' && /^\[[xX]\]/.test(state.doc.sliceString(node.from, node.from + 3))) {
          out.push(Decoration.line({ class: 'cm-task-done' }).range(lineStart(node.from)))
        }
        if (isActive(node.from)) return

        const parent = node.node.parent?.name
        switch (node.name) {
          case 'HeaderMark':
          case 'QuoteMark':
            out.push(hide.range(node.from, nextIsSpace(node.to) ? node.to + 1 : node.to))
            break
          case 'EmphasisMark':
          case 'StrikethroughMark':
            out.push(hide.range(node.from, node.to))
            break
          case 'CodeMark':
            if (parent === 'InlineCode') out.push(hide.range(node.from, node.to))
            break
          case 'LinkMark':
          case 'URL':
            if (parent === 'Link') out.push(hide.range(node.from, node.to))
            break
          case 'ListMark':
            if (node.node.nextSibling?.name === 'Task') {
              out.push(hide.range(node.from, nextIsSpace(node.to) ? node.to + 1 : node.to))
            } else if (node.node.parent?.parent?.name === 'BulletList') {
              out.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
            }
            break
          case 'TaskMarker': {
            const checked = /x/i.test(state.doc.sliceString(node.from, node.to))
            out.push(Decoration.replace({ widget: new CheckboxWidget(checked) }).range(node.from, node.to))
            break
          }
        }
      },
    })
  }
  return Decoration.set(out, true)
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

const tagMatcher = new MatchDecorator({
  regexp: new RegExp(TAG_PATTERN.source, 'gu'),
  decoration: Decoration.mark({ class: 'cm-tag' }),
})

export const tagHighlight = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = tagMatcher.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = tagMatcher.updateDeco(update, this.decorations)
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

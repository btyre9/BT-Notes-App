import { syntaxTree } from '@codemirror/language'
import { StateEffect, type EditorState, type Range } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import { DUE_PATTERN, isoDate, TAG_PATTERN, TASK_LINE, WIKILINK_PATTERN } from '../lib/note'
import { CALLOUT_START } from './callouts'
import type { EditorContext } from './context'

/** Dispatch when other notes changed, so links and cards to them are redrawn. */
export const refreshLinks = StateEffect.define<null>()

const hide = Decoration.replace({})
const CODE_NODES = new Set(['InlineCode', 'FencedCode', 'CodeBlock', 'CodeText'])

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

/** A `[[link]]` alone on its line, shown as a card for the linked page. */
class CardWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly title: string,
    readonly snippet: string,
    readonly exists: boolean,
    readonly ctx: EditorContext,
  ) {
    super()
  }
  eq(other: CardWidget): boolean {
    return other.target === this.target && other.title === this.title && other.snippet === this.snippet && other.exists === this.exists
  }
  toDOM(): HTMLElement {
    const card = document.createElement('span')
    card.className = `cm-card${this.exists ? '' : ' cm-card-missing'}`
    const title = card.appendChild(document.createElement('span'))
    title.className = 'cm-card-title'
    title.textContent = this.title
    const snippet = card.appendChild(document.createElement('span'))
    snippet.className = 'cm-card-snippet'
    snippet.textContent = this.exists ? this.snippet || 'Empty page' : 'New page — click to create'
    card.addEventListener('mousedown', (event) => {
      event.preventDefault()
      this.ctx.open(this.target)
    })
    return card
  }
  ignoreEvent(): boolean {
    return true
  }
}

const CALLOUT_LABELS: Record<string, string> = {
  note: 'Note',
  info: 'Info',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

/** Replaces `[!type]-` with a label and, for toggles, an open/close arrow. */
class CalloutLabelWidget extends WidgetType {
  constructor(
    readonly type: string,
    readonly fold: string,
    readonly signOffset: number,
  ) {
    super()
  }
  eq(other: CalloutLabelWidget): boolean {
    return other.type === this.type && other.fold === this.fold && other.signOffset === this.signOffset
  }
  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement('span')
    label.className = 'cm-callout-label'
    if (this.fold) {
      const arrow = label.appendChild(document.createElement('span'))
      arrow.className = `cm-callout-arrow${this.fold === '-' ? '' : ' open'}`
      arrow.textContent = '▸'
      arrow.title = this.fold === '-' ? 'Expand' : 'Collapse'
      arrow.addEventListener('mousedown', (event) => {
        event.preventDefault()
        const pos = view.posAtDOM(label) + this.signOffset
        const collapsing = this.fold !== '-'
        view.dispatch({
          changes: { from: pos, to: pos + 1, insert: collapsing ? '-' : '+' },
          // Collapsing with the cursor in the body would hide where typing goes; move it to the title.
          selection: collapsing ? { anchor: view.state.doc.lineAt(pos).to } : undefined,
        })
      })
    }
    const name = CALLOUT_LABELS[this.type]
    if (name) label.appendChild(document.createTextNode(name))
    return label
  }
  ignoreEvent(): boolean {
    return true
  }
}

function inCode(state: EditorState, pos: number): boolean {
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1); node; node = node.parent) {
    if (CODE_NODES.has(node.name)) return true
  }
  return false
}

/**
 * Links and due dates aren't in the Markdown grammar, so they're found line by line.
 * Returns the ranges covered by `[[links]]`, which the syntax pass then leaves alone.
 */
function decorateLinksAndDates(
  state: EditorState,
  from: number,
  to: number,
  activeLines: Set<number>,
  ctx: EditorContext,
  out: Range<Decoration>[],
): [number, number][] {
  const linkRanges: [number, number][] = []
  const today = isoDate(new Date())
  for (let pos = from; pos <= to; ) {
    const line = state.doc.lineAt(pos)
    pos = line.to + 1
    const active = activeLines.has(line.number)

    for (const match of line.text.matchAll(WIKILINK_PATTERN)) {
      const start = line.from + match.index
      const end = start + match[0].length
      if (inCode(state, start)) continue
      linkRanges.push([start, end])
      const target = match[1].trim()
      const note = ctx.resolve(target)
      const linkClass = `cm-wikilink${note ? '' : ' cm-wikilink-missing'}`
      if (active) {
        out.push(Decoration.mark({ class: linkClass, attributes: { 'data-link': target } }).range(start, end))
      } else if (line.text.trim() === match[0]) {
        const card = new CardWidget(target, note?.title || target, note?.snippet ?? '', !!note, ctx)
        out.push(Decoration.replace({ widget: card }).range(start, end))
      } else {
        // Show only the alias (or the target), without the brackets.
        const labelStart = match[2] ? start + match[0].lastIndexOf('|') + 1 : start + 2
        out.push(hide.range(start, labelStart))
        out.push(Decoration.mark({ class: linkClass, attributes: { 'data-link': target } }).range(labelStart, end - 2))
        out.push(hide.range(end - 2, end))
      }
    }

    const due = DUE_PATTERN.exec(line.text)
    if (due && !inCode(state, line.from + due.index)) {
      const overdue = due[1] < today && TASK_LINE.exec(line.text)?.[1] === ' '
      const start = line.from + due.index
      out.push(Decoration.mark({ class: `cm-due${overdue ? ' cm-overdue' : ''}` }).range(start, start + due[0].length))
    }
  }
  return linkRanges
}

/** Hides Markdown syntax on every line except the ones the cursor is on, the way Bear does. */
function buildDecorations(view: EditorView, ctx: EditorContext): DecorationSet {
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
    const linkRanges = decorateLinksAndDates(state, from, to, activeLines, ctx, out)
    const inLink = (pos: number) => linkRanges.some(([start, end]) => pos >= start && pos < end)

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
          const first = state.doc.lineAt(node.from)
          const callout = CALLOUT_START.exec(first.text)
          const lineClass = callout ? `cm-callout cm-callout-${callout[1].toLowerCase()}` : 'cm-quote'
          for (let pos = node.from; pos <= node.to; ) {
            const line = state.doc.lineAt(pos)
            const first = line.from === lineStart(node.from)
            out.push(Decoration.line({ class: `${lineClass}${callout && first ? ' cm-callout-first' : ''}` }).range(line.from))
            pos = line.to + 1
          }
          if (callout && !activeLines.has(first.number)) {
            // Hide "> [!type]-" (and the space after it) behind the label.
            const markerEnd = first.from + callout[0].length
            const signOffset = callout[2] ? callout[0].length - 1 : 0
            out.push(
              Decoration.replace({
                widget: new CalloutLabelWidget(callout[1].toLowerCase(), callout[2] ?? '', signOffset),
              }).range(first.from, nextIsSpace(markerEnd) ? markerEnd + 1 : markerEnd),
            )
          }
          return
        }
        if (node.name === 'Task' && /^\[[xX]\]/.test(state.doc.sliceString(node.from, node.from + 3))) {
          out.push(Decoration.line({ class: 'cm-task-done' }).range(lineStart(node.from)))
        }
        if (isActive(node.from) || inLink(node.from)) return

        const parent = node.node.parent?.name
        switch (node.name) {
          case 'HeaderMark':
            out.push(hide.range(node.from, nextIsSpace(node.to) ? node.to + 1 : node.to))
            break
          case 'QuoteMark': {
            // The callout label already covers the marker on a callout's first line.
            const line = state.doc.lineAt(node.from)
            if (line.from === node.from && CALLOUT_START.test(line.text)) break
            out.push(hide.range(node.from, nextIsSpace(node.to) ? node.to + 1 : node.to))
            break
          }
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

export function livePreview(ctx: EditorContext) {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        constructor(view: EditorView) {
          this.decorations = buildDecorations(view, ctx)
        }
        update(update: ViewUpdate) {
          if (
            update.docChanged ||
            update.viewportChanged ||
            update.selectionSet ||
            update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshLinks))) ||
            syntaxTree(update.startState) !== syntaxTree(update.state)
          ) {
            this.decorations = buildDecorations(update.view, ctx)
          }
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    // Click a link to follow it. On the line being edited, where the brackets show, Ctrl/Cmd+click.
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const link = (event.target as HTMLElement).closest<HTMLElement>('[data-link]')
        if (!link) return false
        const line = view.state.doc.lineAt(view.posAtDOM(link))
        const onActiveLine = view.state.selection.ranges.some((r) => r.from <= line.to && r.to >= line.from)
        if (onActiveLine && !(event.ctrlKey || event.metaKey)) return false
        event.preventDefault()
        ctx.open(link.dataset.link!)
        return true
      },
    }),
  ]
}

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

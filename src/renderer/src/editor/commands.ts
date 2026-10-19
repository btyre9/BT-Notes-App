import { startCompletion } from '@codemirror/autocomplete'
import type { EditorView } from '@codemirror/view'
import { isoDate } from '../lib/note'

/** Indentation and any `> ` quote markers, then an optional list or task marker. */
const TASK_PREFIX = /^(\s*(?:>\s*)*)(?:[-*+] (?:\[[ xX]\] )?)?/

/** Turns the current line into a task (`- [ ] `), keeping its text and any quote around it. */
export function makeTask(view: EditorView): void {
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  const prefix = TASK_PREFIX.exec(line.text)!
  if (/\[[ xX]\]/.test(prefix[0])) return
  view.dispatch({
    changes: { from: line.from, to: line.from + prefix[0].length, insert: `${prefix[1]}- [ ] ` },
    selection: { anchor: line.to + (`${prefix[1]}- [ ] `.length - prefix[0].length) },
  })
  view.focus()
}

/** Adds a due date (tomorrow) to the current line, making it a task first if needed. */
export function addDueDate(view: EditorView): void {
  makeTask(view)
  const line = view.state.doc.lineAt(view.state.selection.main.head)
  if (line.text.includes('📅')) return
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const text = ` 📅 ${isoDate(tomorrow)}`
  // Select the date so it can be typed over right away.
  view.dispatch({
    changes: { from: line.to, insert: text },
    selection: { anchor: line.to + text.length - 10, head: line.to + text.length },
  })
  view.focus()
}

/** Blank, or only a quote/list marker left behind by pressing Enter in a quote or list. */
const BLANK_LINE = /^\s*(?:>\s*|[-*+](?: \[[ xX]\])?\s*|\d+[.)]\s*)?$/

/**
 * Inserts text as its own line: in place of the current line if it's blank, otherwise on a new
 * line below. The cursor ends up `cursorFromEnd` characters before the end of the inserted text.
 */
export function insertLine(view: EditorView, text: string, cursorFromEnd = 0): void {
  const { doc } = view.state
  const line = doc.lineAt(view.state.selection.main.head)
  const empty = BLANK_LINE.test(line.text)
  const above = empty ? (line.number > 1 ? doc.line(line.number - 1).text : '') : line.text
  // Directly after a quote or callout, a new line would become part of it, so leave a blank line.
  const gap = /^\s*>/.test(above) ? '\n' : ''
  const from = empty ? line.from : line.to
  const insert = `${empty ? '' : '\n'}${gap}${text}`
  view.dispatch({
    changes: { from, to: line.to, insert },
    selection: { anchor: from + insert.length - cursorFromEnd },
    scrollIntoView: true,
  })
  view.focus()
}

export function insertCallout(view: EditorView): void {
  insertLine(view, '> [!note] ')
}

/** Toggles start open (`+`) so what's typed into them stays visible; click the arrow to close. */
export function insertToggle(view: EditorView): void {
  insertLine(view, '> [!toggle]+ ')
}

/** Types `[[` and opens the list of notes to link to. */
export function insertLink(view: EditorView): void {
  const pos = view.state.selection.main.head
  view.dispatch({ changes: { from: pos, insert: '[[' }, selection: { anchor: pos + 2 } })
  view.focus()
  startCompletion(view)
}

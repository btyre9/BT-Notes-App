import { StateField, type EditorState } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

/** First line of a callout: `> [!type]`, then `-` (collapsed) or `+` (expanded) for toggles. */
export const CALLOUT_START = /^>\s*\[!(\w+)\]([+-])?/

function collapsedCallouts(state: EditorState): DecorationSet {
  const { doc } = state
  const ranges = []
  for (let n = 1; n <= doc.lines; n++) {
    const first = doc.line(n)
    const match = CALLOUT_START.exec(first.text)
    if (!match) continue
    let last = n
    while (last < doc.lines && doc.line(last + 1).text.startsWith('>')) last++
    if (match[2] === '-' && last > n) ranges.push(Decoration.replace({}).range(first.to, doc.line(last).to))
    n = last
  }
  return Decoration.set(ranges)
}

/**
 * Hides the body of collapsed callouts. The `-`/`+` in the file is the open/closed state, so it
 * syncs with the note. This lives in a state field because hiding whole lines can't be done
 * from a view plugin.
 */
export const calloutFolding = StateField.define<DecorationSet>({
  create: collapsedCallouts,
  update: (decorations, tr) => (tr.docChanged ? collapsedCallouts(tr.state) : decorations),
  provide: (field) => EditorView.decorations.from(field),
})

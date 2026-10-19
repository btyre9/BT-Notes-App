import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { Annotation, EditorSelection, type Extension } from '@codemirror/state'
import { drawSelection, dropCursor, EditorView, keymap, type Command } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import { livePreview, tagHighlight } from './livePreview'

/** Marks changes that came from disk, so they aren't saved straight back. */
export const fromDisk = Annotation.define<boolean>()

const bearHighlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: '700' },
  { tag: t.strong, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--text-muted)' },
  { tag: t.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.92em' },
  { tag: t.link, color: 'var(--accent)' },
  { tag: t.url, color: 'var(--text-muted)' },
  { tag: t.quote, color: 'var(--text-muted)' },
  { tag: [t.processingInstruction, t.contentSeparator], color: 'var(--text-faint)' },
])

/** Wraps the selection in a marker such as `**`, or removes it if it's already there. */
function toggleWrap(marker: string): Command {
  return (view) => {
    const len = marker.length
    view.dispatch(
      view.state.changeByRange((range) => {
        const before = view.state.sliceDoc(range.from - len, range.from)
        const after = view.state.sliceDoc(range.to, range.to + len)
        if (before === marker && after === marker) {
          return {
            changes: [
              { from: range.from - len, to: range.from },
              { from: range.to, to: range.to + len },
            ],
            range: EditorSelection.range(range.from - len, range.to - len),
          }
        }
        return {
          changes: [
            { from: range.from, insert: marker },
            { from: range.to, insert: marker },
          ],
          range: EditorSelection.range(range.from + len, range.to + len),
        }
      }),
    )
    return true
  }
}

export function editorExtensions(onChange: (doc: string) => void): Extension[] {
  return [
    history(),
    drawSelection(),
    dropCursor(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(bearHighlight),
    livePreview,
    tagHighlight,
    keymap.of([
      { key: 'Mod-b', run: toggleWrap('**') },
      { key: 'Mod-i', run: toggleWrap('*') },
      { key: 'Mod-Shift-x', run: toggleWrap('~~') },
      indentWithTab,
      ...defaultKeymap,
      ...historyKeymap,
    ]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged && !update.transactions.some((tr) => tr.annotation(fromDisk))) {
        onChange(update.state.doc.toString())
      }
    }),
  ]
}

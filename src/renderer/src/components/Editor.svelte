<script lang="ts">
  import { EditorState, Transaction } from '@codemirror/state'
  import { EditorView } from '@codemirror/view'
  import { store } from '../lib/store.svelte'
  import { editorExtensions, fromDisk } from '../editor/setup'
  import Icon from './Icon.svelte'

  let host: HTMLDivElement
  let view: EditorView | undefined
  let currentId: string | null = null

  const extensions = editorExtensions((doc) => {
    if (currentId) store.edit(currentId, doc)
  })

  $effect(() => {
    view = new EditorView({ parent: host })
    return () => view?.destroy()
  })

  $effect(() => {
    const note = store.selected
    if (!view) return
    if (!note) {
      currentId = null
      return
    }
    if (note.id !== currentId) {
      currentId = note.id
      view.setState(EditorState.create({ doc: note.body, extensions }))
      if (store.newNoteId === note.id) {
        // New notes start as "# ", so the cursor goes straight into the title.
        view.dispatch({ selection: { anchor: 2 } })
        view.focus()
        store.newNoteId = null
      }
    } else if (note.body !== view.state.doc.toString()) {
      // The note changed on disk, for example synced from another device. Kept out of undo
      // history, so Ctrl+Z can't revert the other device's edit and save that.
      const cursor = Math.min(view.state.selection.main.head, note.body.length)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: note.body },
        selection: { anchor: cursor },
        annotations: [fromDisk.of(true), Transaction.addToHistory.of(false)],
      })
    }
  })
</script>

<main class="editor-pane">
  {#if store.selected}
    <header class="toolbar">
      <button
        class="icon-button"
        class:on={store.selected.pinned}
        title={store.selected.pinned ? 'Unpin' : 'Pin to top'}
        onclick={() => store.togglePin(store.selected!.id)}
      >
        <Icon name="pin" />
      </button>
      <button class="icon-button" title="Move to Trash" onclick={() => store.trashNote(store.selected!.id)}>
        <Icon name="trash" />
      </button>
    </header>
  {/if}
  <div class="editor-scroll" class:hidden={!store.selected} bind:this={host}></div>
  {#if !store.selected}
    <p class="placeholder">No note selected</p>
  {/if}
</main>

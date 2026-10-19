<script lang="ts">
  import { EditorState, Transaction } from '@codemirror/state'
  import { EditorView } from '@codemirror/view'
  import { store } from '../lib/store.svelte'
  import { addDueDate, insertCallout, insertLine, insertLink, insertToggle, makeTask } from '../editor/commands'
  import type { EditorContext } from '../editor/context'
  import { refreshLinks } from '../editor/livePreview'
  import { editorExtensions, fromDisk } from '../editor/setup'
  import Icon from './Icon.svelte'

  let host: HTMLDivElement
  let view: EditorView | undefined
  let currentId: string | null = null
  let menuOpen = $state(false)

  const ctx: EditorContext = {
    resolve: (target) => store.resolve(target),
    open: (target) => store.openLink(target),
    linkNames: () => store.linkNames(),
  }
  const extensions = editorExtensions(ctx, (doc) => {
    if (currentId) store.edit(currentId, doc)
  })

  $effect(() => {
    view = new EditorView({ parent: host })
    return () => view?.destroy()
  })

  $effect(() => {
    const note = store.selected
    const focus = store.focus
    if (!view) return
    if (!note) {
      currentId = null
      return
    }
    if (note.id !== currentId) {
      currentId = note.id
      view.setState(EditorState.create({ doc: note.body, extensions }))
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
    if (focus?.id === note.id) {
      const line = view.state.doc.line(Math.min(focus.line + 1, view.state.doc.lines))
      view.dispatch({ selection: { anchor: line.to }, scrollIntoView: true })
      view.focus()
      store.focus = null
    }
  })

  $effect(() => {
    void store.otherNotesVersion
    view?.dispatch({ effects: refreshLinks.of(null) })
  })

  function run(command: (view: EditorView) => void) {
    menuOpen = false
    if (view) command(view)
  }

  function addSubpage() {
    menuOpen = false
    const subpage = store.createSubpage()
    if (!view || !subpage) return
    insertLine(view, `[[${subpage.linkName}]]`)
    store.open(subpage.id, 0)
  }
</script>

<svelte:window onmousedown={(e) => menuOpen && !(e.target as Element).closest('.insert') && (menuOpen = false)} />

<main class="editor-pane">
  {#if store.selected}
    <header class="toolbar">
      <div class="insert">
        <button class="text-button" onclick={() => (menuOpen = !menuOpen)} aria-expanded={menuOpen}>
          <Icon name="plus" /> Insert
        </button>
        {#if menuOpen}
          <div class="menu" role="menu">
            <button role="menuitem" onclick={() => run(makeTask)}>Task</button>
            <button role="menuitem" onclick={() => run(addDueDate)}>Due date</button>
            <button role="menuitem" onclick={() => run(insertLink)}>Link to note</button>
            <button role="menuitem" onclick={addSubpage}>Subpage</button>
            <button role="menuitem" onclick={() => run(insertCallout)}>Callout</button>
            <button role="menuitem" onclick={() => run(insertToggle)}>Toggle</button>
          </div>
        {/if}
      </div>
      <span class="spacer"></span>
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
  <div class="editor-scroll" class:hidden={!store.selected}>
    <div bind:this={host}></div>
    {#if store.backlinks.length}
      <section class="backlinks">
        <h2>Linked from</h2>
        {#each store.backlinks as link (link.note.id)}
          <button class="backlink" onclick={() => store.open(link.note.id)}>
            <span class="backlink-title">{link.note.title || 'Untitled'}</span>
            <span class="backlink-context">{link.context}</span>
          </button>
        {/each}
      </section>
    {/if}
  </div>
  {#if !store.selected}
    <p class="placeholder">No note selected</p>
  {/if}
</main>

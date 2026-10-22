<script lang="ts">
  import BoardView from './components/BoardView.svelte'
  import FolderSearch from './components/FolderSearch.svelte'
  import Editor from './components/Editor.svelte'
  import NoteList from './components/NoteList.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import TaskList from './components/TaskList.svelte'
  import { boards } from './lib/boards.svelte'
  import { store } from './lib/store.svelte'

  store.init().catch((err: Error) => (store.error = err.message))

  function onKeyDown(event: KeyboardEvent) {
    // Ctrl+\ (Cmd+\ on a Mac) hides or shows the sidebar beside a board.
    if (event.key === '\\' && (event.ctrlKey || event.metaKey) && store.mode === 'board') {
      event.preventDefault()
      store.toggleSidebar()
    }
  }
</script>

<svelte:window onkeydown={onKeyDown} />

{#if store.ready && !store.root}
  <div class="welcome">
    <h1>Vizual Notes</h1>
    <p>Choose the folder where your notes live, for example <code>BT Notes</code> in iCloud Drive.</p>
    <button class="primary" onclick={() => store.chooseFolder()}>Choose folder…</button>
  </div>
{:else if store.ready}
  {@const panel = store.mode === 'board' && store.panelOpen && store.selected}
  {@const hideSidebar = store.mode === 'board' && store.sidebarHidden}
  <div class="app" class:board-mode={store.mode === 'board'} class:with-panel={panel} class:sidebar-hidden={hideSidebar}>
    {#if !hideSidebar}
      <Sidebar />
    {/if}
    {#if store.mode === 'board'}
      <BoardView />
      {#if panel}
        <Editor />
      {/if}
    {:else}
      {#if store.filter.kind === 'tasks'}
        <TaskList />
      {:else}
        <NoteList />
      {/if}
      <Editor />
    {/if}
  </div>
{/if}

{#if store.ready && store.root && store.folderSearch}
  <FolderSearch onclose={() => (store.folderSearch = false)} />
{/if}

{#if store.error || boards.error}
  <div class="toast" role="alert">
    <span>{store.error ?? boards.error}</span>
    <button onclick={() => (store.error ? (store.error = null) : (boards.error = null))}>Dismiss</button>
  </div>
{/if}

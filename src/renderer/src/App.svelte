<script lang="ts">
  import BoardView from './components/BoardView.svelte'
  import Editor from './components/Editor.svelte'
  import NoteList from './components/NoteList.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import TaskList from './components/TaskList.svelte'
  import { boards } from './lib/boards.svelte'
  import { store } from './lib/store.svelte'

  store.init().catch((err: Error) => (store.error = err.message))
</script>

{#if store.ready && !store.root}
  <div class="welcome">
    <h1>BT Notes</h1>
    <p>Choose the folder where your notes live, for example <code>Dropbox\BT Notes</code>.</p>
    <button class="primary" onclick={() => store.chooseFolder()}>Choose folder…</button>
  </div>
{:else if store.ready}
  {@const panel = store.mode === 'board' && store.panelOpen && store.selected}
  <div class="app" class:board-mode={store.mode === 'board'} class:with-panel={panel}>
    <Sidebar />
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

{#if store.error || boards.error}
  <div class="toast" role="alert">
    <span>{store.error ?? boards.error}</span>
    <button onclick={() => (store.error ? (store.error = null) : (boards.error = null))}>Dismiss</button>
  </div>
{/if}

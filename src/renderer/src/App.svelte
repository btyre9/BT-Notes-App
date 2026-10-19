<script lang="ts">
  import Editor from './components/Editor.svelte'
  import NoteList from './components/NoteList.svelte'
  import Sidebar from './components/Sidebar.svelte'
  import { store } from './lib/store.svelte'

  store.init().catch((err: Error) => (store.error = err.message))
</script>

{#if store.ready && !store.root}
  <div class="welcome">
    <h1>BT Notes</h1>
    <p>Choose the folder where your notes live, for example <code>G:\My Drive\BT Notes</code>.</p>
    <button class="primary" onclick={() => store.chooseFolder()}>Choose folder…</button>
  </div>
{:else if store.ready}
  <div class="app">
    <Sidebar />
    <NoteList />
    <Editor />
  </div>
{/if}

{#if store.error}
  <div class="toast" role="alert">
    <span>{store.error}</span>
    <button onclick={() => (store.error = null)}>Dismiss</button>
  </div>
{/if}

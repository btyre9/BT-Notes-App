<script lang="ts">
  import { store, type Filter } from '../lib/store.svelte'
  import Icon from './Icon.svelte'
  import TagTree from './TagTree.svelte'

  const views: { kind: Exclude<Filter['kind'], 'tag'>; label: string; icon: 'notes' | 'pin' | 'untagged' | 'todo' }[] = [
    { kind: 'all', label: 'Notes', icon: 'notes' },
    { kind: 'pinned', label: 'Pinned', icon: 'pin' },
    { kind: 'untagged', label: 'Untagged', icon: 'untagged' },
    { kind: 'todo', label: 'Todo', icon: 'todo' },
  ]
</script>

<nav class="sidebar">
  <div class="views">
    {#each views as view (view.kind)}
      <button
        class="nav-item"
        class:active={store.filter.kind === view.kind}
        onclick={() => store.setFilter({ kind: view.kind })}
      >
        <Icon name={view.icon} />
        <span class="label">{view.label}</span>
      </button>
    {/each}
  </div>
  {#if store.tagTree.length}
    <h2 class="section-title">Tags</h2>
    <TagTree nodes={store.tagTree} />
  {/if}
</nav>

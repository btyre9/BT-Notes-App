<script lang="ts">
  import { store, type Filter } from '../lib/store.svelte'
  import Calendar from './Calendar.svelte'
  import Icon from './Icon.svelte'
  import TagTree from './TagTree.svelte'

  type View = { kind: Exclude<Filter['kind'], 'tag'>; label: string; icon: 'notes' | 'calendar' | 'pin' | 'untagged' | 'todo' }

  const views: View[] = [
    { kind: 'all', label: 'Notes', icon: 'notes' },
    { kind: 'daily', label: 'Daily notes', icon: 'calendar' },
    { kind: 'tasks', label: 'Tasks', icon: 'todo' },
    { kind: 'pinned', label: 'Pinned', icon: 'pin' },
    { kind: 'untagged', label: 'Untagged', icon: 'untagged' },
  ]

  function choose(view: View) {
    // Daily notes opens today's note, creating it if needed.
    if (view.kind === 'daily') store.openDaily()
    else store.setFilter({ kind: view.kind })
  }
</script>

<nav class="sidebar">
  <div class="views">
    {#each views as view (view.kind)}
      <button class="nav-item" class:active={store.filter.kind === view.kind} onclick={() => choose(view)}>
        <Icon name={view.icon} />
        <span class="label">{view.label}</span>
        {#if view.kind === 'tasks' && store.openTasks.length}
          <span class="count">{store.openTasks.length}</span>
        {/if}
      </button>
    {/each}
  </div>
  <Calendar />
  {#if store.tagTree.length}
    <h2 class="section-title">Tags</h2>
    <TagTree nodes={store.tagTree} />
  {/if}
</nav>

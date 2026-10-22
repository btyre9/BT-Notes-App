<script lang="ts">
  // Find Folder (⌘K): jump to any folder by name. Each result shows where the folder sits, so
  // folders no board holds stand out.
  import { boardName, HOME_BOARD, pathFromHome, parentChain } from '../lib/board'
  import { boardIconOf } from '../lib/boardIcons'
  import { boards } from '../lib/boards.svelte'
  import { findFolders } from '../lib/folderSearch'
  import { store } from '../lib/store.svelte'
  import BoardTile from './BoardTile.svelte'
  import Icon from './Icon.svelte'

  let { onclose }: { onclose: () => void } = $props()

  /** How many results are listed; typing narrows the rest. */
  const SHOWN = 50

  let query = $state('')
  let active = $state(0)
  let list = $state<HTMLElement>()

  const results = $derived(findFolders(boards.list.map((b) => b.path), query, boards.recent).slice(0, SHOWN))

  $effect(() => {
    void query
    active = 0
  })

  // Keeps the highlighted result in view while arrowing through the list.
  $effect(() => {
    void active
    list?.querySelector<HTMLElement>('.folder-result.active')?.scrollIntoView({ block: 'nearest' })
  })

  /** Where a folder sits: the folders above it, or that no board holds it. */
  function placeOf(path: string): string {
    if (path === HOME_BOARD) return 'Where everything starts'
    const all = boards.list
    const route = pathFromHome(all, path) ?? parentChain(all, path)
    if (route.length < 2) return 'Not on any board'
    return route
      .slice(0, -1)
      .map((p) => (p === HOME_BOARD ? 'Home' : boardName(p)))
      .join(' › ')
  }

  function choose(path: string) {
    store.mode = 'board'
    boards.open(path)
    onclose()
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onclose()
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      active = Math.min(active + 1, results.length - 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      active = Math.max(active - 1, 0)
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault()
      choose(results[active])
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="folder-search-backdrop" onclick={onclose}>
  <div class="folder-search" role="dialog" aria-label="Find a folder" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <div class="folder-search-field">
      <Icon name="search" />
      <!-- svelte-ignore a11y_autofocus -->
      <input
        bind:value={query}
        placeholder="Find a folder"
        spellcheck="false"
        autofocus
        aria-label="Folder name"
        aria-controls="folder-results"
        onkeydown={onKey}
      />
      <kbd>esc</kbd>
    </div>
    <div class="folder-results" id="folder-results" role="listbox" bind:this={list}>
      {#each results as path, i (path)}
        {@const board = boards.get(path)}
        {@const place = placeOf(path)}
        <button
          class="folder-result"
          class:active={i === active}
          role="option"
          aria-selected={i === active}
          onmouseenter={() => (active = i)}
          onclick={() => choose(path)}
        >
          <span class="sidebar-tile"><BoardTile icon={boardIconOf(board?.data)} size={14} /></span>
          <span class="folder-result-name">{path === HOME_BOARD ? 'Home' : boardName(path)}</span>
          <span class="folder-result-place" class:stray={place === 'Not on any board'}>{place}</span>
        </button>
      {:else}
        <p class="folder-search-empty">No folder called “{query.trim()}”</p>
      {/each}
    </div>
  </div>
</div>

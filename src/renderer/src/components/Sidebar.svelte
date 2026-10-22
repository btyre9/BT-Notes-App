<script lang="ts">
  import { boardName, HOME_BOARD, type CanvasData } from '../lib/board'
  import { boardIconOf } from '../lib/boardIcons'
  import { boards } from '../lib/boards.svelte'
  import BoardTile from './BoardTile.svelte'
  import { store, type Filter } from '../lib/store.svelte'
  import Calendar from './Calendar.svelte'
  import Icon from './Icon.svelte'
  import TagTree from './TagTree.svelte'
  import WorkspaceSwitcher from './WorkspaceSwitcher.svelte'

  type View = { kind: Exclude<Filter['kind'], 'tag'>; label: string; icon: 'notes' | 'inbox' | 'calendar' | 'pin' | 'untagged' | 'todo' }

  const views: View[] = [
    { kind: 'all', label: 'Notes', icon: 'notes' },
    { kind: 'inbox', label: 'Inbox', icon: 'inbox' },
    { kind: 'daily', label: 'Daily notes', icon: 'calendar' },
    { kind: 'tasks', label: 'Tasks', icon: 'todo' },
    { kind: 'pinned', label: 'Pinned', icon: 'pin' },
    { kind: 'untagged', label: 'Untagged', icon: 'untagged' },
  ]

  /** The Find Folder shortcut as this computer writes it. */
  const findShortcut = /Mac/i.test(navigator.platform) ? '⌘K' : 'Ctrl+K'

  function openBoard(path: string) {
    store.mode = 'board'
    boards.open(path)
  }

  /** The number shown beside a view: notes waiting in the Inbox, open tasks. */
  function countOf(view: View): number {
    if (view.kind === 'inbox') return store.inboxCount
    if (view.kind === 'tasks') return store.openTasks.length
    return 0
  }

  function choose(view: View) {
    // Daily notes opens today's note, creating it if needed.
    if (view.kind === 'daily') store.openDaily()
    else store.setFilter({ kind: view.kind })
  }
</script>

<nav class="sidebar">
  <!-- Folders are found by opening them from Home. The sidebar keeps Home, the folders you star,
       and the ones you opened last; the breadcrumb above a board shows where it sits. -->
  {#snippet folderRow(board: { path: string; data: CanvasData }, label = boardName(board.path))}
    <button class="nav-item" class:active={store.mode === 'board' && boards.current === board.path} onclick={() => openBoard(board.path)}>
      <span class="sidebar-tile"><BoardTile icon={boardIconOf(board.data)} size={12} /></span>
      <span class="label">{label}</span>
    </button>
  {/snippet}
  <WorkspaceSwitcher />
  <div class="views folder-home">
    <button class="nav-item find-folder" title="Find a folder by name ({findShortcut})" onclick={() => (store.folderSearch = true)}>
      <Icon name="search" />
      <span class="label">Find folder…</span>
      <kbd>{findShortcut}</kbd>
    </button>
    {#if boards.get(HOME_BOARD)}{@render folderRow(boards.get(HOME_BOARD)!, 'Home')}{/if}
  </div>
  {#if boards.favorites.length}
    <h2 class="section-title">Favorites</h2>
    <div class="views">
      {#each boards.favorites as board (board.path)}{@render folderRow(board)}{/each}
    </div>
  {/if}
  {#if boards.recentList.length}
    <h2 class="section-title">Recent</h2>
    <div class="views">
      {#each boards.recentList as board (board.path)}{@render folderRow(board)}{/each}
    </div>
  {/if}
  <h2 class="section-title">Notes</h2>
  <div class="views">
    {#each views as view (view.kind)}
      <button class="nav-item" class:active={store.mode === 'notes' && store.filter.kind === view.kind} onclick={() => choose(view)}>
        <Icon name={view.icon} />
        <span class="label">{view.label}</span>
        {#if countOf(view)}
          <span class="count">{countOf(view)}</span>
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

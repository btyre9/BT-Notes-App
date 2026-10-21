<script lang="ts">
  import { boardName } from '../lib/board'
  import { boardIconOf } from '../lib/boardIcons'
  import { boards } from '../lib/boards.svelte'
  import BoardTile from './BoardTile.svelte'
  import { store, type Filter } from '../lib/store.svelte'
  import Calendar from './Calendar.svelte'
  import Icon from './Icon.svelte'
  import TagTree from './TagTree.svelte'

  type View = { kind: Exclude<Filter['kind'], 'tag'>; label: string; icon: 'notes' | 'inbox' | 'calendar' | 'pin' | 'untagged' | 'todo' }

  const views: View[] = [
    { kind: 'all', label: 'Notes', icon: 'notes' },
    { kind: 'inbox', label: 'Inbox', icon: 'inbox' },
    { kind: 'daily', label: 'Daily notes', icon: 'calendar' },
    { kind: 'tasks', label: 'Tasks', icon: 'todo' },
    { kind: 'pinned', label: 'Pinned', icon: 'pin' },
    { kind: 'untagged', label: 'Untagged', icon: 'untagged' },
  ]

  let naming = $state(false)

  function openBoard(path: string) {
    store.mode = 'board'
    boards.open(path)
  }

  function createBoard(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const name = input.value.trim()
    naming = false
    if (name) openBoard(boards.create(name))
  }

  function onNameKey(event: KeyboardEvent) {
    const input = event.currentTarget as HTMLInputElement
    if (event.key === 'Enter') input.blur()
    if (event.key === 'Escape') {
      input.value = ''
      input.blur()
    }
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
  <div class="section-header">
    <h2 class="section-title">Boards</h2>
    <button class="section-add" title="New board" aria-label="New board" onclick={() => (naming = true)}><Icon name="plus" /></button>
  </div>
  <div class="views">
    {#each boards.list as board (board.path)}
      <button
        class="nav-item"
        class:active={store.mode === 'board' && boards.current === board.path}
        onclick={() => openBoard(board.path)}
      >
        <span class="sidebar-tile"><BoardTile icon={boardIconOf(board.data)} size={12} /></span>
        <span class="label">{boardName(board.path)}</span>
      </button>
    {/each}
    {#if naming}
      <!-- svelte-ignore a11y_autofocus -->
      <input class="board-name-input" placeholder="Board name" autofocus onblur={createBoard} onkeydown={onNameKey} />
    {/if}
  </div>
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

<script lang="ts">
  import { isoDate, plainLine } from '../lib/note'
  import { store, type TaskItem } from '../lib/store.svelte'

  const today = isoDate(new Date())
  const dayMonth = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

  const groups = $derived.by(() => {
    const byDue = (a: TaskItem, b: TaskItem) => (a.task.due ?? '').localeCompare(b.task.due ?? '') || b.note.mtime - a.note.mtime
    const items = [...store.openTasks].sort(byDue)
    return [
      { label: 'Overdue', items: items.filter((i) => i.task.due && i.task.due < today), overdue: true },
      { label: 'Today', items: items.filter((i) => i.task.due === today), overdue: false },
      { label: 'Upcoming', items: items.filter((i) => i.task.due && i.task.due > today), overdue: false },
      { label: 'No date', items: items.filter((i) => !i.task.due), overdue: false },
    ].filter((g) => g.items.length)
  })

  function formatDue(due: string): string {
    const [y, m, d] = due.split('-').map(Number)
    return dayMonth.format(new Date(y, m - 1, d))
  }
</script>

<section class="note-list task-list">
  <header class="list-header">
    <h1 class="list-title">Tasks</h1>
  </header>
  <div class="list-scroll">
    {#each groups as group (group.label)}
      <h2 class="task-group" class:overdue={group.overdue}>{group.label}</h2>
      {#each group.items as { note, task } (`${note.id}:${task.line}`)}
        <div class="task-row" class:selected={note.id === store.selectedId}>
          <input
            type="checkbox"
            class="cm-task"
            aria-label="Complete task"
            onchange={() => store.toggleTask(note.id, task.line)}
          />
          <button class="task-main" onclick={() => store.open(note.id, task.line)}>
            <span class="task-text">{plainLine(task.text) || 'Untitled task'}</span>
            <span class="task-note">{note.title || 'Untitled'}</span>
          </button>
          {#if task.due}
            <span class="task-due" class:overdue={group.overdue}>{formatDue(task.due)}</span>
          {/if}
        </div>
      {/each}
    {:else}
      <p class="empty">No open tasks</p>
    {/each}
  </div>
</section>

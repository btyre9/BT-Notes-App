<script lang="ts">
  import { baseName, DAILY_DIR, isoDate } from '../lib/note'
  import { store } from '../lib/store.svelte'

  const firstOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1)

  let month = $state(firstOfMonth(new Date()))
  const today = isoDate(new Date())
  const monthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
  // Weeks start on Sunday; the labels come from the system locale.
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'narrow' }).format(new Date(2026, 0, 4 + i)),
  )

  /** Six weeks of dates covering the shown month. */
  const days = $derived.by(() => {
    const start = new Date(month)
    start.setDate(1 - start.getDay())
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i))
  })

  const openDate = $derived(store.selected?.path.startsWith(DAILY_DIR) ? baseName(store.selected.path) : null)

  function shift(months: number) {
    month = new Date(month.getFullYear(), month.getMonth() + months, 1)
  }
</script>

<div class="calendar">
  <header class="calendar-header">
    <button class="calendar-nav" aria-label="Previous month" onclick={() => shift(-1)}>‹</button>
    <button class="calendar-title" title="Go to today" onclick={() => (month = firstOfMonth(new Date()))}>
      {monthLabel.format(month)}
    </button>
    <button class="calendar-nav" aria-label="Next month" onclick={() => shift(1)}>›</button>
  </header>
  <div class="calendar-grid">
    {#each weekdays as day, i (i)}
      <span class="weekday">{day}</span>
    {/each}
    {#each days as day (day.getTime())}
      {@const date = isoDate(day)}
      <button
        class="day"
        class:other-month={day.getMonth() !== month.getMonth()}
        class:today={date === today}
        class:open={date === openDate}
        class:has-note={store.dailyDates.has(date)}
        aria-label={day.toDateString()}
        onclick={() => store.openDaily(day)}
      >
        {day.getDate()}
      </button>
    {/each}
  </div>
</div>

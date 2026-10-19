<script lang="ts">
  import { store } from '../lib/store.svelte'
  import Icon from './Icon.svelte'

  // Only the first part of a long list is rendered; more is added while scrolling.
  const PAGE = 200
  let limit = $state(PAGE)
  let search: HTMLInputElement

  $effect(() => {
    void store.query
    void store.filter
    limit = PAGE
  })

  $effect(() => {
    if (store.searchFocus) search.focus()
  })

  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
  const dayMonth = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
  const full = new Intl.DateTimeFormat(undefined, { dateStyle: 'short' })

  function formatDate(ms: number): string {
    const date = new Date(ms)
    const now = new Date()
    if (date.toDateString() === now.toDateString()) return time.format(date)
    if (date.getFullYear() === now.getFullYear()) return dayMonth.format(date)
    return full.format(date)
  }

  function onScroll(event: Event) {
    const el = event.currentTarget as HTMLElement
    if (el.scrollTop + el.clientHeight > el.scrollHeight - 400) limit += PAGE
  }

  function onSearchKey(event: KeyboardEvent) {
    if (event.key === 'Escape') store.query = ''
    if (event.key === 'Enter' && store.visible[0]) store.select(store.visible[0].id)
  }
</script>

<section class="note-list">
  <header class="list-header">
    <input
      class="search"
      type="search"
      placeholder="Search"
      spellcheck="false"
      bind:value={store.query}
      bind:this={search}
      onkeydown={onSearchKey}
    />
    <button class="icon-button" title="New note (Ctrl+N)" onclick={() => store.createNote()}>
      <Icon name="plus" />
    </button>
  </header>
  <div class="list-scroll" onscroll={onScroll}>
    {#each store.visible.slice(0, limit) as note (note.id)}
      <button class="list-item" class:selected={note.id === store.selectedId} onclick={() => store.select(note.id)}>
        <span class="item-title">
          {#if note.pinned}<span class="pin-mark"><Icon name="pin" /></span>{/if}
          {note.title || 'Untitled'}
        </span>
        <span class="item-snippet">{note.snippet}</span>
        <span class="item-date">{formatDate(note.mtime)}</span>
      </button>
    {:else}
      <p class="empty">{store.query ? 'No matching notes' : 'No notes'}</p>
    {/each}
  </div>
</section>

<script lang="ts">
  import { boardName, HOME_BOARD } from '../lib/board'
  import { boards } from '../lib/boards.svelte'
  import { store } from '../lib/store.svelte'

  interface Option {
    label: string
    detail?: string
    disabled?: boolean
    choose: () => void
  }

  let {
    kind,
    onnote,
    onnewnote,
    onboard,
    onnewboard,
    onclose,
  }: {
    kind: 'note' | 'board'
    onnote: (path: string) => void
    onnewnote: (title: string) => void
    onboard: (path: string) => void
    onnewboard: (name: string) => void
    onclose: () => void
  } = $props()

  let query = $state('')
  let active = $state(0)
  let input: HTMLInputElement

  const options = $derived.by((): Option[] => {
    const q = query.trim()
    if (kind === 'note') {
      return [
        { label: q ? `New note “${q}”` : 'New note', choose: () => onnewnote(q) },
        ...store.findNotes(q).map((note) => ({
          label: note.title || 'Untitled',
          detail: note.snippet,
          choose: () => onnote(note.path),
        })),
      ]
    }
    const matching = boards.list.filter(
      (b) => b.path !== boards.current && b.path !== HOME_BOARD && boardName(b.path).toLowerCase().includes(q.toLowerCase()),
    )
    return [
      { label: q ? `New board “${q}”` : 'Type a name for a new board', disabled: !q, choose: () => onnewboard(q) },
      ...matching.map((b) => ({ label: boardName(b.path), detail: `${b.data.nodes.length} cards`, choose: () => onboard(b.path) })),
    ]
  })

  $effect(() => {
    void query
    active = 0
  })

  $effect(() => input.focus())

  function choose(option: Option | undefined) {
    if (!option || option.disabled) return
    option.choose()
    onclose()
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose()
    else if (event.key === 'ArrowDown') active = Math.min(active + 1, options.length - 1)
    else if (event.key === 'ArrowUp') active = Math.max(active - 1, 0)
    else if (event.key === 'Enter') choose(options[active])
    else return
    event.preventDefault()
  }
</script>

<div class="picker" role="dialog" aria-label={kind === 'note' ? 'Add a note' : 'Add a board'}>
  <input
    class="search"
    bind:this={input}
    bind:value={query}
    {onkeydown}
    placeholder={kind === 'note' ? 'Find or create a note' : 'Find or name a board'}
    spellcheck="false"
  />
  <div class="picker-list">
    {#each options as option, i (i)}
      <button
        class="picker-item"
        class:active={i === active}
        disabled={option.disabled}
        onmouseenter={() => (active = i)}
        onclick={() => choose(option)}
      >
        <span class="picker-label">{option.label}</span>
        {#if option.detail}<span class="picker-detail">{option.detail}</span>{/if}
      </button>
    {/each}
  </div>
</div>

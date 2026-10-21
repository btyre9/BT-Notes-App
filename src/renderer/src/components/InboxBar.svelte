<script lang="ts">
  // Shown above a note that's waiting in the Inbox: add tags, then file it into Notes/.
  import { store } from '../lib/store.svelte'
  import Icon from './Icon.svelte'

  let { id }: { id: string } = $props()
  let tagging = $state(false)
  let input = $state<HTMLInputElement>()

  $effect(() => {
    if (tagging) input?.focus()
  })

  function addTag() {
    const tag = input?.value.trim()
    if (tag) store.tagNote(id, tag)
    if (input) input.value = ''
  }

  function onKey(event: KeyboardEvent) {
    // Enter adds the tag and keeps the box open for another; Escape closes it.
    if (event.key === 'Enter') {
      event.preventDefault()
      addTag()
    } else if (event.key === 'Escape') {
      if (input) input.value = ''
      tagging = false
    }
  }

  function onBlur() {
    addTag()
    tagging = false
  }
</script>

<div class="inbox-bar">
  <span class="inbox-label"><Icon name="inbox" /> Inbox</span>
  {#if tagging}
    <input
      bind:this={input}
      class="tag-input"
      list="inbox-tags"
      placeholder="Tag, then Enter"
      spellcheck="false"
      onkeydown={onKey}
      onblur={onBlur}
    />
    <datalist id="inbox-tags">
      {#each store.allTags as tag (tag)}
        <option value={tag}></option>
      {/each}
    </datalist>
  {:else}
    <button class="text-button" title="Add a tag" onclick={() => (tagging = true)}><Icon name="tag" /> Tag</button>
  {/if}
  <button class="text-button" title="Move to Notes and open the next note in the Inbox" onclick={() => store.fileNote(id)}>
    <Icon name="move" /> File
  </button>
</div>

<style>
  .inbox-bar {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .inbox-label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-size: 12px;
    font-weight: 600;
  }

  .tag-input {
    width: 150px;
    padding: 4px 8px;
    border: 1px solid var(--accent);
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    outline: none;
  }
</style>

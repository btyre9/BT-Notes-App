<script lang="ts">
  import type { TagNode } from '../lib/note'
  import { NOTE_DRAG, store } from '../lib/store.svelte'
  import Icon from './Icon.svelte'
  import TagTree from './TagTree.svelte'

  let { nodes, depth = 0 }: { nodes: TagNode[]; depth?: number } = $props()
  let open = $state<Record<string, boolean>>({})
  /** The tag a note is being dragged over. */
  let dropTag = $state<string | null>(null)
  /** Hovering a dragged note over a closed tag with subtags opens it after a moment. */
  let openTimer: ReturnType<typeof setTimeout> | undefined

  const isNoteDrag = (event: DragEvent) => event.dataTransfer?.types.includes(NOTE_DRAG) ?? false

  function onDragOver(event: DragEvent, node: TagNode) {
    if (!isNoteDrag(event)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    if (dropTag === node.tag) return
    dropTag = node.tag
    clearTimeout(openTimer)
    if (node.children.length && !open[node.tag]) openTimer = setTimeout(() => (open[node.tag] = true), 700)
  }

  function onDragLeave(node: TagNode) {
    if (dropTag !== node.tag) return
    dropTag = null
    clearTimeout(openTimer)
  }

  function onDrop(event: DragEvent, node: TagNode) {
    const id = event.dataTransfer?.getData(NOTE_DRAG)
    dropTag = null
    clearTimeout(openTimer)
    if (!id) return
    event.preventDefault()
    store.tagNote(id, node.tag)
  }
</script>

<ul class="tag-tree">
  {#each nodes as node (node.tag)}
    <li>
      <div class="tag-row" style:padding-left="{12 + depth * 14}px">
        {#if node.children.length}
          <button
            class="disclosure"
            class:open={open[node.tag]}
            aria-label={open[node.tag] ? 'Collapse' : 'Expand'}
            onclick={() => (open[node.tag] = !open[node.tag])}
          >
            <Icon name="chevron" />
          </button>
        {:else}
          <span class="disclosure"></span>
        {/if}
        <button
          class="nav-item"
          class:active={store.mode === 'notes' && store.filter.kind === 'tag' && store.filter.tag === node.tag}
          class:drop-target={dropTag === node.tag}
          data-tag={node.tag}
          onclick={() => store.setFilter({ kind: 'tag', tag: node.tag })}
          ondragover={(e) => onDragOver(e, node)}
          ondragleave={() => onDragLeave(node)}
          ondrop={(e) => onDrop(e, node)}
        >
          <Icon name="tag" />
          <span class="label">{node.name}</span>
          <span class="count">{node.count}</span>
        </button>
      </div>
      {#if node.children.length && open[node.tag]}
        <TagTree nodes={node.children} depth={depth + 1} />
      {/if}
    </li>
  {/each}
</ul>

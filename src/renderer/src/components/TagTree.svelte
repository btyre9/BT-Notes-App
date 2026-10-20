<script lang="ts">
  import type { TagNode } from '../lib/note'
  import { store } from '../lib/store.svelte'
  import Icon from './Icon.svelte'
  import TagTree from './TagTree.svelte'

  let { nodes, depth = 0 }: { nodes: TagNode[]; depth?: number } = $props()
  let open = $state<Record<string, boolean>>({})
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
          onclick={() => store.setFilter({ kind: 'tag', tag: node.tag })}
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

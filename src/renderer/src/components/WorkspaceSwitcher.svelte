<script lang="ts">
  // The workspace switcher at the top of the sidebar: each workspace is a notes folder with its own
  // Home, folders, notes and Inbox, like Personal and Work.
  import { store } from '../lib/store.svelte'
  import Icon from './Icon.svelte'

  const isMac = /Mac/i.test(navigator.platform)
  const COLORS = ['#5b6cff', '#e5484d', '#12a594', '#f76b15', '#8e4ec6', '#3e63dd', '#d6409f', '#46a758']

  let open = $state(false)
  /** Where the menu opens: under the switcher, floating over the board so it can be wider than the sidebar. */
  let menuAt = $state({ top: 0, left: 0 })

  function toggle(event: MouseEvent) {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    menuAt = { top: rect.bottom + 4, left: rect.left }
    open = !open
  }
  let renaming = $state<string | null>(null)
  let draft = $state('')

  const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && a.toLowerCase() === b.toLowerCase()
  const active = $derived(store.workspaces.find((w) => same(w.path, store.root)) ?? null)

  /** A steady color per workspace name, for its letter badge. */
  function colorOf(name: string): string {
    let h = 0
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return COLORS[h % COLORS.length]
  }

  async function choose(path: string) {
    open = false
    await store.switchWorkspace(path)
  }

  function startRename(path: string, name: string) {
    renaming = path
    draft = name
  }

  async function finishRename() {
    const path = renaming
    renaming = null
    if (path && draft.trim()) await store.renameWorkspace(path, draft)
  }

  async function remove(path: string, name: string) {
    if (confirm(`Remove “${name}” from your workspaces? Its folder and everything in it stay where they are.`)) await store.removeWorkspace(path)
  }
</script>

<svelte:window onpointerdown={(e) => open && !(e.target as Element).closest('.workspace') && (open = false)} />

<div class="workspace">
  <button class="workspace-button" aria-expanded={open} title="Switch workspace" onclick={toggle}>
    {#if active}
      <span class="workspace-badge" style:background={colorOf(active.name)}>{active.name.slice(0, 1).toUpperCase()}</span>
      <span class="workspace-name">{active.name}</span>
    {:else}
      <span class="workspace-name">Workspace</span>
    {/if}
    <span class="workspace-chevron"><Icon name="chevron" /></span>
  </button>

  {#if open}
    <div class="workspace-menu" role="menu" style:top="{menuAt.top}px" style:left="{menuAt.left}px">
      {#each store.workspaces as workspace (workspace.path)}
        {@const isActive = same(workspace.path, store.root)}
        <div class="workspace-row" class:unavailable={!workspace.available}>
          {#if renaming === workspace.path}
            <span class="workspace-badge" style:background={colorOf(draft || workspace.name)}>{(draft || workspace.name).slice(0, 1).toUpperCase()}</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input
              class="workspace-rename"
              bind:value={draft}
              autofocus
              aria-label="Workspace name"
              onkeydown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur()
                if (e.key === 'Escape') {
                  draft = ''
                  e.currentTarget.blur()
                }
              }}
              onblur={finishRename}
            />
          {:else}
            <button
              class="workspace-choice"
              role="menuitemradio"
              aria-checked={isActive}
              disabled={!workspace.available}
              title={workspace.available ? workspace.path : `Its folder isn’t on this computer: ${workspace.path}`}
              onclick={() => choose(workspace.path)}
            >
              <span class="workspace-badge" style:background={colorOf(workspace.name)}>{workspace.name.slice(0, 1).toUpperCase()}</span>
              <span class="workspace-choice-text">
                <span class="workspace-choice-name">{workspace.name}</span>
                {#if !workspace.available}<span class="workspace-note">Not on this computer</span>
                {:else if isMac && same(workspace.path, store.captureWorkspace)}<span class="workspace-note">Gets Apple Notes captures</span>{/if}
              </span>
              {#if isActive}<span class="workspace-check">✓</span>{/if}
            </button>
            <button class="workspace-tool" title="Rename" aria-label="Rename {workspace.name}" onclick={() => startRename(workspace.path, workspace.name)}><Icon name="pencil" /></button>
            {#if !isActive}
              <button class="workspace-tool" title="Remove from the list (the folder stays)" aria-label="Remove {workspace.name}" onclick={() => remove(workspace.path, workspace.name)}><Icon name="close" /></button>
            {/if}
          {/if}
        </div>
      {/each}
      <div class="workspace-divider"></div>
      <button class="workspace-action" role="menuitem" onclick={() => ((open = false), store.addWorkspace())}><Icon name="plus" /> Add workspace…</button>
      {#if isMac && active && !same(active.path, store.captureWorkspace)}
        <button class="workspace-action" role="menuitem" onclick={() => ((open = false), store.setCaptureWorkspace(active.path))}>
          <Icon name="inbox" /> Send Apple Notes captures here
        </button>
      {/if}
    </div>
  {/if}
</div>

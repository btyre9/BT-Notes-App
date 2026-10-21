<script lang="ts">
  import { colorOf } from '../lib/board'
  import { isLight } from '../lib/palette'
  import { BOARD_ICONS, DEFAULT_BOARD_ICON, type BoardIcon } from '../lib/boardIcons'

  /** A board's icon on its tile: an image, or a Lucide icon, white on the board's color. */
  let { icon, size = 40, missing = false }: { icon: BoardIcon; size?: number; missing?: boolean } = $props()

  const color = $derived(colorOf(icon.color))
  const name = $derived(icon.icon && Object.hasOwn(BOARD_ICONS, icon.icon) ? icon.icon : DEFAULT_BOARD_ICON)
  const nodes = $derived(BOARD_ICONS[name])

  // An image that isn't there yet, for example because the board synced first, is tried again.
  let broken = $state(false)
  let attempt = $state(0)
  const imageUrl = $derived(
    icon.image ? `btfile://thumb/${icon.image.split('/').map(encodeURIComponent).join('/')}?w=256&retry=${attempt}` : null,
  )

  $effect(() => {
    void icon.image
    broken = false
  })

  $effect(() => {
    if (!broken) return
    const timer = setTimeout(() => {
      broken = false
      attempt++
    }, 5000)
    return () => clearTimeout(timer)
  })
</script>

<div class="board-tile" class:colored={color} class:light={color && isLight(color)} class:missing style:--tile-color={color}>
  {#if imageUrl && !broken}
    <img src={imageUrl} alt="" draggable="false" onerror={() => (broken = true)} />
  {:else}
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {#each nodes as [tag, attrs], i (i)}
        <svelte:element this={tag} {...attrs} />
      {/each}
    </svg>
  {/if}
</div>

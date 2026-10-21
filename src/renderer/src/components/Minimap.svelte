<script lang="ts">
  // A small map of the whole board in the corner. The outlined box is what's on screen; click
  // or drag on the map to move there.
  import { boundsOf, colorOf, type CanvasNode } from '../lib/board'
  import type { View } from '../lib/boards.svelte'

  let {
    nodes,
    view,
    width,
    height,
    onjump,
  }: {
    nodes: CanvasNode[]
    view: View
    width: number
    height: number
    /** Centers the board on this point, in board units. */
    onjump: (x: number, y: number) => void
  } = $props()

  const MAP_W = 168
  const MAP_H = 104
  const PAD = 6

  /** The part of the board on screen, in board units. */
  const screen = $derived({ x: -view.x / view.zoom, y: -view.y / view.zoom, width: width / view.zoom, height: height / view.zoom })

  /** Board units → map pixels, fitting the cards and the screen box together. */
  const fit = $derived.by(() => {
    const area = boundsOf([...nodes, screen])!
    const scale = Math.min((MAP_W - 2 * PAD) / area.width, (MAP_H - 2 * PAD) / area.height)
    return {
      scale,
      // Centered in the map.
      dx: PAD + (MAP_W - 2 * PAD - area.width * scale) / 2 - area.x * scale,
      dy: PAD + (MAP_H - 2 * PAD - area.height * scale) / 2 - area.y * scale,
    }
  })

  const box = (r: { x: number; y: number; width: number; height: number }) => ({
    x: r.x * fit.scale + fit.dx,
    y: r.y * fit.scale + fit.dy,
    width: Math.max(1, r.width * fit.scale),
    height: Math.max(1, r.height * fit.scale),
  })

  const screenBox = $derived(box(screen))

  let dragging = false

  function jump(event: PointerEvent) {
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect()
    onjump((event.clientX - rect.left - fit.dx) / fit.scale, (event.clientY - rect.top - fit.dy) / fit.scale)
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
  class="minimap"
  width={MAP_W}
  height={MAP_H}
  onpointerdown={(e) => {
    e.stopPropagation()
    dragging = true
    ;(e.currentTarget as SVGElement).setPointerCapture(e.pointerId)
    jump(e)
  }}
  onpointermove={(e) => dragging && jump(e)}
  onpointerup={() => (dragging = false)}
  onpointercancel={() => (dragging = false)}
>
  {#each nodes as node (node.id)}
    {@const r = box(node)}
    <rect
      class={node.type === 'group' ? 'minimap-group' : 'minimap-card'}
      x={r.x}
      y={r.y}
      width={r.width}
      height={r.height}
      rx="1.5"
      style:--node-color={colorOf(node.color as string | undefined)}
    />
  {/each}
  <rect class="minimap-screen" x={screenBox.x} y={screenBox.y} width={screenBox.width} height={screenBox.height} rx="2" />
</svg>

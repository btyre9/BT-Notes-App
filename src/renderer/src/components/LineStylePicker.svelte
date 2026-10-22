<script lang="ts">
  // The style of selected arrows: line type, pattern, thickness, which ends have heads, and the
  // heads' shape. Each option is a small drawing of the line it makes.
  import type { Snippet } from 'svelte'
  import { ARROW_ENDS, HEAD_SHAPES, LINE_PATTERNS, LINE_TYPES, LINE_WEIGHTS, type EdgeStyle } from '../lib/board'

  let { value, onchange }: { value: EdgeStyle; onchange: (change: Partial<EdgeStyle>) => void } = $props()

  const LINE_PATHS: Record<EdgeStyle['line'], string> = {
    curved: 'M4 16 C18 16 22 4 36 4',
    straight: 'M4 16 L36 4',
    elbow: 'M4 16 H17 Q20 16 20 13 V7 Q20 4 23 4 H36',
  }
  const DASHES: Record<EdgeStyle['pattern'], string> = { solid: '', dashed: '5 3.5', dotted: '0.1 3.5' }
  const WIDTHS: Record<EdgeStyle['weight'], number> = { thin: 1, medium: 2, thick: 3.5 }
  const LABELS: Record<string, string> = {
    curved: 'Curved',
    straight: 'Straight',
    elbow: 'Right angles',
    solid: 'Solid',
    dashed: 'Dashed',
    dotted: 'Dotted',
    thin: 'Thin',
    medium: 'Medium',
    thick: 'Thick',
    none: 'No arrowheads',
    end: 'Arrowhead at the end',
    start: 'Arrowhead at the start',
    both: 'Arrowheads at both ends',
    filled: 'Filled arrowheads',
    closed: 'Outlined arrowheads',
    open: 'Open arrowheads',
  }

  /** An arrowhead at x pointing right (dir 1) or left (dir -1), at height y. */
  function head(x: number, y: number, dir: 1 | -1, shape: EdgeStyle['head']): string {
    const back = x - dir * 6
    return shape === 'open' ? `M${back} ${y - 4} L${x} ${y} L${back} ${y + 4}` : `M${x} ${y} L${back} ${y - 3.5} L${back} ${y + 3.5} Z`
  }
</script>

{#snippet option(selected: boolean, label: string, pick: () => void, drawing: Snippet)}
  <button class="line-option" class:selected aria-pressed={selected} title={label} aria-label={label} onclick={pick}>
    <svg viewBox="0 0 40 20" width="40" height="20" aria-hidden="true">{@render drawing()}</svg>
  </button>
{/snippet}

<div class="line-style" role="group" aria-label="Line style">
  <div class="line-row">
    <span class="line-row-label">Line</span>
    {#each LINE_TYPES as line (line)}
      {#snippet drawing()}<path d={LINE_PATHS[line]} />{/snippet}
      {@render option(value.line === line, LABELS[line], () => onchange({ line }), drawing)}
    {/each}
  </div>
  <div class="line-row">
    <span class="line-row-label">Pattern</span>
    {#each LINE_PATTERNS as pattern (pattern)}
      {#snippet drawing()}<path d="M4 10 H36" stroke-dasharray={DASHES[pattern]} />{/snippet}
      {@render option(value.pattern === pattern, LABELS[pattern], () => onchange({ pattern }), drawing)}
    {/each}
  </div>
  <div class="line-row">
    <span class="line-row-label">Weight</span>
    {#each LINE_WEIGHTS as weight (weight)}
      {#snippet drawing()}<path d="M4 10 H36" style:stroke-width={WIDTHS[weight]} />{/snippet}
      {@render option(value.weight === weight, LABELS[weight], () => onchange({ weight }), drawing)}
    {/each}
  </div>
  <div class="line-row">
    <span class="line-row-label">Ends</span>
    {#each ARROW_ENDS as ends (ends)}
      {#snippet drawing()}
        <path d="M5 10 H35" />
        {#if ends === 'end' || ends === 'both'}<path class="line-head" d={head(36, 10, 1, 'filled')} />{/if}
        {#if ends === 'start' || ends === 'both'}<path class="line-head" d={head(4, 10, -1, 'filled')} />{/if}
      {/snippet}
      {@render option(value.ends === ends, LABELS[ends], () => onchange({ ends }), drawing)}
    {/each}
  </div>
  <div class="line-row">
    <span class="line-row-label">Head</span>
    {#each HEAD_SHAPES as shape (shape)}
      {#snippet drawing()}
        <path d="M4 10 H34" />
        <path class="line-head head-{shape}" d={head(36, 10, 1, shape)} />
      {/snippet}
      {@render option(value.head === shape, LABELS[shape], () => onchange({ head: shape }), drawing)}
    {/each}
  </div>
</div>

<script lang="ts">
  // A board's canvas: its theme and background pattern, each shown as a small preview.
  import { CANVAS_PATTERNS, CANVAS_THEMES, type CanvasLook } from '../lib/board'

  let { value, onchange }: { value: CanvasLook; onchange: (change: Partial<CanvasLook>) => void } = $props()

  const THEME_LABELS: Record<CanvasLook['theme'], string> = { system: 'System', light: 'Light', dark: 'Dark', nord: 'Nord' }
  const PATTERN_LABELS: Record<CanvasLook['pattern'], string> = { none: 'None', dots: 'Dots', grid: 'Grid', lines: 'Lines', graph: 'Graph' }
</script>

<div class="canvas-picker" role="group" aria-label="Canvas">
  <div class="canvas-section">Theme</div>
  <div class="canvas-options">
    {#each CANVAS_THEMES as theme (theme)}
      <button
        class="canvas-option"
        class:selected={value.theme === theme}
        aria-pressed={value.theme === theme}
        title={theme === 'system' ? 'Follow the Mac’s light or dark setting' : `${THEME_LABELS[theme]} theme`}
        onclick={() => onchange({ theme })}
      >
        <span class="theme-preview theme-preview-{theme}"><span></span></span>
        {THEME_LABELS[theme]}
      </button>
    {/each}
  </div>
  <div class="canvas-section">Pattern</div>
  <div class="canvas-options">
    {#each CANVAS_PATTERNS as pattern (pattern)}
      <button
        class="canvas-option"
        class:selected={value.pattern === pattern}
        aria-pressed={value.pattern === pattern}
        title="{PATTERN_LABELS[pattern]} pattern"
        onclick={() => onchange({ pattern })}
      >
        <span class="pattern-preview pattern-{pattern}"></span>
        {PATTERN_LABELS[pattern]}
      </button>
    {/each}
  </div>
</div>

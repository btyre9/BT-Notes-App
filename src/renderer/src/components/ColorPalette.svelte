<script lang="ts">
  import { colorOf } from '../lib/board'
  import { colorName, HUES, NEUTRALS, recentColors, rememberColor } from '../lib/palette'
  import Icon from './Icon.svelte'

  /** The full color palette: every hue in five shades, neutrals, recent custom colors, and a custom picker. */
  let {
    value = null,
    allowNone = true,
    onpick,
  }: {
    /** The current color, as a preset id or hex, to mark as chosen. */
    value?: string | null
    allowNone?: boolean
    onpick: (color: string | null) => void
  } = $props()

  const current = $derived(colorOf(value ?? undefined)?.toLowerCase() ?? null)
  let recent = $state(recentColors())
  let hexDraft = $state('')
  const canPick = 'EyeDropper' in window

  /** A custom color: applied and remembered for next time. */
  function pickCustom(hex: string) {
    rememberColor(hex)
    recent = recentColors()
    onpick(hex.toLowerCase())
  }

  function onHexKey(event: KeyboardEvent) {
    if (event.key !== 'Enter') return
    const value = hexDraft.trim()
    const hex = value.startsWith('#') ? value : `#${value}`
    if (/^#[0-9a-f]{6}$/i.test(hex)) pickCustom(hex)
  }

  async function pickFromScreen() {
    try {
      // @ts-expect-error EyeDropper isn't in TypeScript's DOM types yet.
      const { sRGBHex } = await new window.EyeDropper().open()
      pickCustom(String(sRGBHex))
    } catch {
      // Cancelled with Esc.
    }
  }
</script>

<div class="palette">
  <div class="palette-grid" role="group" aria-label="Colors">
    {#each HUES as hue (hue.name)}
      <div class="palette-column">
        {#each hue.shades as hex, shade (hex)}
          <button
            class="palette-color"
            class:chosen={current === hex}
            style:background={hex}
            title={colorName(hue.name, shade)}
            aria-label={colorName(hue.name, shade)}
            onclick={() => onpick(hex)}
          ></button>
        {/each}
      </div>
    {/each}
  </div>
  <div class="palette-row" role="group" aria-label="Neutrals">
    {#if allowNone}
      <button class="palette-color swatch-none" class:chosen={!current} title="No color" aria-label="No color" onclick={() => onpick(null)}></button>
    {/if}
    {#each NEUTRALS as hex (hex)}
      <button class="palette-color" class:chosen={current === hex} style:background={hex} title={hex.toUpperCase()} aria-label={hex.toUpperCase()} onclick={() => onpick(hex)}></button>
    {/each}
  </div>
  {#if recent.length}
    <div class="palette-row" role="group" aria-label="Recent colors">
      <span class="palette-label">Recent</span>
      {#each recent as hex (hex)}
        <button class="palette-color" class:chosen={current === hex} style:background={hex} title={hex.toUpperCase()} aria-label={hex.toUpperCase()} onclick={() => onpick(hex)}></button>
      {/each}
    </div>
  {/if}
  <div class="palette-custom">
    <input type="color" value={current ?? '#888888'} onchange={(e) => pickCustom(e.currentTarget.value)} aria-label="Pick any color" title="Pick any color" />
    <input class="palette-hex" bind:value={hexDraft} onkeydown={onHexKey} placeholder={current?.toUpperCase() ?? 'Hex code, then Enter'} spellcheck="false" aria-label="Hex code" />
    {#if canPick}
      <button class="icon-button" title="Pick a color from the screen" aria-label="Pick a color from the screen" onclick={pickFromScreen}>
        <Icon name="eyedropper" />
      </button>
    {/if}
  </div>
</div>

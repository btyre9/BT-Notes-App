<script lang="ts">
  import { BOARD_ICONS, DEFAULT_BOARD_ICON, type BoardIcon } from '../lib/boardIcons'
  import ColorPalette from './ColorPalette.svelte'

  /** Chooses a board's icon: a color for its tile, one of the icons, or an image. */
  let {
    icon,
    onchange,
    onimage,
    onclose,
  }: {
    icon: BoardIcon
    onchange: (icon: BoardIcon) => void
    /** An image file was chosen; the board copies it into Attachments/ and uses it. */
    onimage: (file: File) => void
    onclose: () => void
  } = $props()

  let imageInput: HTMLInputElement

  function chooseImage() {
    const file = imageInput.files?.[0]
    imageInput.value = ''
    if (file) onimage(file)
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="picker icon-picker" role="dialog" aria-label="Board icon">
  <div class="icon-picker-colors" role="group" aria-label="Tile color">
    <ColorPalette value={icon.color ?? null} onpick={(color) => onchange({ ...icon, color: color ?? undefined })} />
  </div>
  <div class="icon-grid" role="group" aria-label="Icon">
    {#each Object.entries(BOARD_ICONS) as [name, nodes] (name)}
      <button
        class="icon-choice"
        class:chosen={!icon.image && (icon.icon ?? DEFAULT_BOARD_ICON) === name}
        title={name.replace(/-/g, ' ')}
        aria-label={name.replace(/-/g, ' ')}
        onclick={() => onchange({ ...icon, icon: name, image: undefined })}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          {#each nodes as [tag, attrs], i (i)}
            <svelte:element this={tag} {...attrs} />
          {/each}
        </svg>
      </button>
    {/each}
  </div>
  <div class="icon-picker-actions">
    <button class="text-button" onclick={() => imageInput.click()}>Use an image…</button>
    {#if icon.image}
      <button class="text-button" onclick={() => onchange({ ...icon, image: undefined })}>Remove image</button>
    {/if}
    <input class="hidden-input" type="file" accept="image/*" bind:this={imageInput} onchange={chooseImage} />
  </div>
</div>

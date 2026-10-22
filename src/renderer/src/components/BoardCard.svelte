<script lang="ts">
  import { untrack } from 'svelte'
  import { boardName, colorOf, DOC_TYPES, isCircle, kindOf, swatchOf, type CanvasNode, type Side } from '../lib/board'
  import { boardIconOf } from '../lib/boardIcons'
  import { drawDiagram, renderText } from '../lib/markdown'
  import { theme } from '../lib/theme.svelte'
  import { makePdfPreview } from '../lib/pdf'
  import BoardTile from './BoardTile.svelte'
  import { boards } from '../lib/boards.svelte'
  import { plainLine } from '../lib/note'
  import { isLight } from '../lib/palette'
  import { store } from '../lib/store.svelte'
  import Icon from './Icon.svelte'

  let {
    node,
    zoom,
    selected,
    editing,
    dropTarget = false,
    linkTarget = false,
    inColumn = false,
    autosize = false,
    onpointerdown,
    onresizestart,
    onconnectstart,
    onopen,
    oncommit,
    onautosize,
  }: {
    node: CanvasNode
    zoom: number
    selected: boolean
    editing: boolean
    /** A column that dragged cards would go into. */
    dropTarget?: boolean
    /** The card an arrow being drawn would point to. */
    linkTarget?: boolean
    /** Stacked in a column, where cards sit flat on the column's panel. */
    inColumn?: boolean
    /** Just edited: report the height the rendered text needs, so the card can grow to fit. */
    autosize?: boolean
    onpointerdown: (event: PointerEvent) => void
    onresizestart: (event: PointerEvent) => void
    /** Starts drawing an arrow from one of the card's sides. */
    onconnectstart: (event: PointerEvent, side: Side) => void
    onopen: () => void
    /** Ends editing with the new text (or group label). */
    oncommit: (text: string) => void
    onautosize?: (height: number) => void
  } = $props()

  const SIDES: Side[] = ['top', 'right', 'bottom', 'left']

  const kind = $derived(kindOf(node))
  const color = $derived(colorOf(node.color))
  /**
   * Cards filled with their color, exactly as picked, with dark or light text to suit it. Images,
   * videos, PDFs and board tiles cover their card, so they show the color as a border instead.
   */
  const filled = $derived(!!color && ['text', 'note', 'link', 'file', 'group', 'column'].includes(kindOf(node)))
  const lightFill = $derived(filled && isLight(color!))
  const note = $derived(kind === 'note' && node.file ? store.noteByPath(node.file) : null)
  const linked = $derived(kind === 'board' && node.file ? boards.get(node.file) : null)

  /** The note's text after its title, as plain lines. */
  const noteLines = $derived.by(() => {
    if (!note) return []
    const lines = note.body.split('\n')
    const titleLine = lines.findIndex((l) => l.trim())
    return lines
      .slice(titleLine + 1)
      .map(plainLine)
      .filter(Boolean)
      .slice(0, 24)
  })

  /** Retries after a failed load, since an image can arrive after the board that shows it. */
  let attempt = $state(0)
  let broken = $state(false)

  $effect(() => {
    if (!broken) return
    const timer = setTimeout(() => {
      broken = false
      attempt++
    }, 5000)
    return () => clearTimeout(timer)
  })

  const fileUrl = (host: 'file' | 'thumb', path: string, width?: number) => {
    const params = new URLSearchParams()
    if (width) params.set('w', String(width))
    if (attempt) params.set('retry', String(attempt))
    const query = params.size ? `?${params}` : ''
    return `btfile://${host}/${path.split('/').map(encodeURIComponent).join('/')}${query}`
  }

  // A small preview is always shown; a sharper one is laid over it when the card is shown large.
  const shownWidth = $derived(node.width * zoom * window.devicePixelRatio)
  const sharp = $derived(
    kind !== 'image' || !node.file || shownWidth <= 256
      ? null
      : shownWidth <= 800
        ? fileUrl('thumb', node.file, 800)
        : fileUrl('file', node.file),
  )

  const fileName = $derived(node.file ? node.file.slice(node.file.lastIndexOf('/') + 1) : '')
  const docType = $derived(DOC_TYPES.find((t) => t.pattern.test(fileName)))
  const extension = $derived(fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.') + 1).toUpperCase() : '')
  const plainName = $derived(fileName.includes('.') ? fileName.slice(0, fileName.lastIndexOf('.')) : fileName)

  // A document's title and first lines, read from inside the file by the main process.
  let docTitle = $state<string | undefined>()
  let docLines = $state<string[]>([])
  $effect(() => {
    const path = (kind === 'file' || kind === 'pdf') && node.file ? node.file : null
    docTitle = undefined
    docLines = []
    if (!path) return
    let current = true
    window.bt.vault
      .docInfo(path)
      .then((info) => {
        if (!current) return
        docTitle = info.title
        docLines = info.lines
      })
      .catch(() => {})
    return () => {
      current = false
    }
  })
  /** Short cards made before documents became pages show a single line. */
  const compactDoc = $derived(node.height < 140)

  // A PDF's preview is drawn the first time its card is shown on this device. If that fails, for
  // example because the board synced before the PDF did, it's tried again a few times.
  let pdfState = $state<'loading' | 'drawing' | 'failed'>('loading')
  let pdfTries = 0
  function onPdfMissing() {
    if (pdfState !== 'loading' || !node.file) return
    pdfState = 'drawing'
    makePdfPreview(node.file)
      .then(() => {
        pdfState = 'loading'
        attempt++
      })
      .catch((err) => {
        console.warn(`No preview for ${node.file}:`, err)
        pdfState = 'failed'
        if (++pdfTries < 4) setTimeout(() => (pdfState = 'loading'), 5000 * pdfTries)
      })
  }

  let videoFailed = $state(false)

  // ---- Color swatches ----
  const swatch = $derived(kind === 'swatch' ? swatchOf(node) : null)
  let swatchHex = $state('#888888')
  let swatchName = $state('')
  let swatchEditor = $state<HTMLDivElement>()
  /** While the eyedropper is open the window loses focus; that shouldn't end editing. */
  let picking = false
  const canPick = 'EyeDropper' in window

  $effect(() => {
    if (!editing || kind !== 'swatch' || !swatchEditor) return
    const editor = swatchEditor
    untrack(() => {
      swatchHex = swatch?.hex ?? '#888888'
      swatchName = swatch?.name ?? ''
      editor.querySelector<HTMLInputElement>('.swatch-name-input')?.focus({ preventScroll: true })
    })
  })

  function commitSwatch() {
    if (editing && !picking && document.hasFocus()) oncommit(`${swatchHex}\n${swatchName}`)
  }

  /** Ends editing when focus leaves the swatch's fields, not when it moves between them. */
  function onSwatchFocusOut(event: FocusEvent) {
    if (!swatchEditor?.contains(event.relatedTarget as Node | null)) commitSwatch()
  }

  function onHexInput(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value.trim()
    const hex = value.startsWith('#') ? value : `#${value}`
    if (/^#[0-9a-f]{6}$/i.test(hex)) swatchHex = hex.toLowerCase()
  }

  async function pickFromScreen() {
    picking = true
    try {
      // @ts-expect-error EyeDropper isn't in TypeScript's DOM types yet.
      const { sRGBHex } = await new window.EyeDropper().open()
      swatchHex = String(sRGBHex).toLowerCase()
    } catch {
      // Cancelled with Esc.
    } finally {
      picking = false
      swatchEditor?.querySelector<HTMLInputElement>('.swatch-name-input')?.focus({ preventScroll: true })
    }
  }

  function onSwatchKey(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      commitSwatch()
    }
  }

  // Text cards show their Markdown rendered: tables, lists, and Mermaid charts and diagrams.
  const rendered = $derived(kind === 'text' && !editing ? renderText(node.text ?? '') : null)
  let textBody = $state<HTMLDivElement>()

  $effect(() => {
    const body = textBody
    const text = rendered
    const dark = theme.dark
    const reportSize = untrack(() => autosize)
    if (!body || !text) return
    let current = true
    const mode = dark ? 'dark' : 'light'
    // The same HTML keeps its drawn diagrams, so only slots not yet drawn in this theme are drawn.
    const slots = [...body.querySelectorAll<HTMLElement>('[data-diagram]')].filter((slot) => slot.dataset.theme !== mode)
    const drawing = slots.map((slot) =>
      drawDiagram(text.diagrams[Number(slot.dataset.diagram)] ?? '', dark).then(
        (svg) => {
          if (!current) return
          slot.innerHTML = svg
          slot.className = 'drawn'
          slot.dataset.theme = mode
        },
        (err: Error) => {
          if (!current) return
          slot.querySelector('.diagram-error')?.remove()
          const message = document.createElement('div')
          message.className = 'diagram-error'
          message.textContent = `This chart has a mistake: ${err.message.split('\n')[0]}`
          slot.prepend(message)
          slot.className = 'failed'
          slot.dataset.theme = mode
        },
      ),
    )
    if (reportSize) void Promise.all(drawing).then(() => current && onautosize?.(body.scrollHeight))
    return () => {
      current = false
    }
  })

  /**
   * Presses on the video's controls bar work the controls instead of moving the card. Elsewhere on
   * the video, a click selects the card rather than playing, and a double-click opens the video in
   * the video player rather than going full screen.
   */
  const onControls = (event: MouseEvent) =>
    event.clientY > (event.currentTarget as HTMLElement).getBoundingClientRect().bottom - 48 * zoom

  function onVideoDown(event: PointerEvent) {
    if (onControls(event)) event.stopPropagation()
  }

  function onVideoClick(event: MouseEvent) {
    if (!onControls(event)) event.preventDefault()
  }
  const host = $derived.by(() => {
    try {
      return new URL(node.url ?? '').hostname
    } catch {
      return node.url ?? ''
    }
  })

  const labelled = $derived(kind === 'group' || kind === 'column')
  let field = $state<HTMLTextAreaElement | HTMLInputElement>()
  let draft = $state('')

  // Starts editing from the card's text or label; untracked so typing doesn't reset it.
  $effect(() => {
    if (!editing || !field) return
    const input = field
    untrack(() => {
      draft = (labelled ? node.label : node.text) ?? ''
      input.focus({ preventScroll: true })
      input.setSelectionRange(draft.length, draft.length)
    })
  })

  function commit() {
    // Switching to another window also takes focus away; keep editing until the user comes back.
    if (editing && document.hasFocus()) oncommit(draft)
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' || (labelled && event.key === 'Enter')) field?.blur()
  }
</script>

<div
  class="card card-{kind}"
  class:selected
  class:drop-target={dropTarget}
  class:link-target={linkTarget}
  class:in-column={inColumn}
  class:colored={color}
  class:filled
  class:circle={isCircle(node)}
  class:light-fill={lightFill}
  class:dark-fill={filled && !lightFill}
  class:missing={(kind === 'note' && !note) || (kind === 'board' && !linked) || broken}
  style:left="{node.x}px"
  style:top="{node.y}px"
  style:width="{node.width}px"
  style:height="{node.height}px"
  style:--card-color={color}
  data-id={node.id}
  {onpointerdown}
  ondblclick={(e) => {
    e.stopPropagation()
    onopen()
  }}
  role="figure"
>
  {#if kind === 'image' && node.file}
    {#if broken}
      <div class="card-body card-placeholder"><Icon name="image" /> Missing image: {fileName}</div>
    {:else}
      <img src={fileUrl('thumb', node.file, 256)} alt={fileName} draggable="false" onerror={() => (broken = true)} />
      {#if sharp}<img src={sharp} alt="" draggable="false" />{/if}
    {/if}
  {:else if kind === 'swatch' && swatch}
    <div class="swatch-color" style:background={editing ? swatchHex : swatch.hex}></div>
    {#if editing}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="swatch-editor" bind:this={swatchEditor} onfocusout={onSwatchFocusOut} onpointerdown={(e) => e.stopPropagation()} onkeydown={onSwatchKey}>
        <div class="swatch-row">
          <input type="color" value={swatchHex} oninput={(e) => (swatchHex = e.currentTarget.value)} aria-label="Color" />
          <input class="swatch-hex-input" value={swatchHex.toUpperCase()} oninput={onHexInput} aria-label="Hex code" spellcheck="false" />
          {#if canPick}
            <button class="icon-button" title="Pick a color from the screen" aria-label="Pick a color from the screen" onclick={pickFromScreen}>
              <Icon name="eyedropper" />
            </button>
          {/if}
        </div>
        <input class="swatch-name-input" bind:value={swatchName} placeholder="Name (optional)" aria-label="Name" />
      </div>
    {:else}
      <div class="swatch-label">
        <div class="swatch-hex">{swatch.hex.toUpperCase()}</div>
        {#if swatch.name}<div class="swatch-name">{swatch.name}</div>{/if}
      </div>
    {/if}
  {:else if kind === 'pdf' && node.file}
    <!-- A page with a red band: the PDF's title, then its first page. -->
    <div class="doc-band">
      <span class="doc-badge">PDF</span>
      <span class="doc-band-title" title={fileName}>{docTitle ?? plainName}</span>
    </div>
    <div class="pdf-frame">
      {#if pdfState === 'failed'}
        <div class="card-body card-placeholder"><Icon name="file" /> {fileName}</div>
      {:else}
        <img class="pdf-page" src={fileUrl('thumb', node.file, 800)} alt={fileName} draggable="false" onerror={onPdfMissing} />
      {/if}
    </div>
  {:else if kind === 'video' && node.file}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      src={fileUrl('file', node.file)}
      poster={fileUrl('thumb', node.file, 800)}
      preload="none"
      controls
      playsinline
      draggable="false"
      onerror={() => (videoFailed = true)}
      onpointerdown={onVideoDown}
      onclick={onVideoClick}
      ondblclick={onVideoClick}
    ></video>
    {#if videoFailed}
      <div class="video-note">This video can't play here. Double-click to open it in your video player.</div>
    {/if}
  {:else if kind === 'note'}
    <div class="card-body">
      {#if note}
        <div class="card-title">{note.title || 'Untitled'}</div>
        {#each noteLines as line, i (i)}<p>{line}</p>{/each}
      {:else}
        <div class="card-title"><Icon name="notes" /> Missing note</div>
        <p>{node.file}</p>
      {/if}
    </div>
  {:else if kind === 'board'}
    <!-- Like Storyflow: a folder with the board's image, or its icon on its color, and its name
         underneath. A color picked for this card recolors the folder; without one, it has the
         board's own color. -->
    <BoardTile
      icon={color ? { ...boardIconOf(linked?.data), color } : boardIconOf(linked?.data)}
      size={Math.max(22, Math.min(node.width, node.height - 40) * 0.32)}
      missing={!linked}
      folder
    />
    <div class="board-name" title={linked ? `${linked.data.nodes.length} cards` : 'Missing board'}>
      {boardName(node.file ?? '')}
    </div>
  {:else if kind === 'link'}
    <div class="card-body">
      <div class="card-title"><Icon name="link" /> {host}</div>
      <p class="card-url">{node.url}</p>
    </div>
  {:else if kind === 'file'}
    <!-- A page in the app's color: its title, its first lines, and the file's name. -->
    <div class="doc doc-{docType?.app ?? 'other'}" class:compact={compactDoc}>
      <div class="doc-band">
        <span class="doc-badge">{docType?.letter ?? (extension.slice(0, 4) || '?')}</span>
        <span class="doc-type">{docType?.label ?? (extension ? `${extension} file` : 'File')}</span>
      </div>
      <div class="doc-body">
        <div class="doc-title">{docTitle ?? plainName}</div>
        {#each docLines as line, i (i)}<p>{line}</p>{/each}
      </div>
      <div class="doc-file" title={fileName}>{fileName}</div>
    </div>
  {:else if labelled}
    {#if editing}
      <input
        class="card-group-label group-label-input"
        bind:this={field}
        bind:value={draft}
        onblur={commit}
        {onkeydown}
        onpointerdown={(e) => e.stopPropagation()}
        placeholder={kind === 'column' ? 'Column name' : 'Group name'}
      />
    {:else}
      <div class="card-group-label">{node.label ?? ''}</div>
    {/if}
    {#if kind === 'column' && !(node.btCards as string[] | undefined)?.length}
      <div class="column-empty">Drag cards here</div>
    {/if}
  {:else if editing}
    <textarea
      class="card-editor"
      bind:this={field}
      bind:value={draft}
      onblur={commit}
      {onkeydown}
      onpointerdown={(e) => e.stopPropagation()}
      spellcheck="true"
    ></textarea>
  {:else}
    <div class="card-body card-text card-md" bind:this={textBody}>{@html rendered?.html ?? ''}</div>
  {/if}
  {#if selected && !editing}
    <div class="resize-handle" style:--handle-scale={1 / zoom} onpointerdown={onresizestart} role="separator" aria-label="Resize"></div>
  {/if}
  {#if !editing}
    {#each SIDES as side (side)}
      <div
        class="connect-handle connect-{side}"
        style:--handle-scale={1 / zoom}
        onpointerdown={(e) => onconnectstart(e, side)}
        role="button"
        tabindex="-1"
        aria-label="Draw an arrow from the {side} side"
      ></div>
    {/each}
  {/if}
</div>

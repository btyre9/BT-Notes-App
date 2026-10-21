<script lang="ts">
  // 16px line icons drawn with the current text color.
  const paths = {
    notes: 'M4 2.5h6l2.5 2.5v8.5h-8.5zM10 2.5V5h2.5M6 8h4.5M6 10.5h4.5',
    inbox: 'M2.5 9h3l1 2h3l1-2h3M4.5 3h7l2 6v4.5h-11V9z',
    calendar: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
    pin: 'M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5',
    untagged: 'M2.5 8.5V3h5.5l5.5 5.5-5 5zM5.5 6h.01M3 13l10-10',
    todo: 'M3 3h10v10H3zM5.5 8l2 2 3-4',
    tag: 'M6 2.5 4.5 13.5M11.5 2.5 10 13.5M3 6h10.5M2.5 10h10.5',
    trash: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9',
    plus: 'M8 3v10M3 8h10',
    chevron: 'M6 4l4 4-4 4',
    back: 'M10 4 6 8l4 4',
    close: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
    board: 'M2.5 3h11v10h-11zM4.5 5h3v3h-3zM9 5h2.5M9 7.5h2.5M4.5 10h7',
    text: 'M3.5 4h9M8 4v8.5',
    image: 'M2.5 3.5h11v9h-11zM2.5 10.5l3-3 2.5 2.5 2-2 3.5 3.5M10.5 6h.01',
    link: 'M7 9a2.5 2.5 0 0 0 3.5 0l2-2A2.5 2.5 0 0 0 9 3.5l-.7.7M9 7a2.5 2.5 0 0 0-3.5 0l-2 2A2.5 2.5 0 0 0 7 12.5l.7-.7',
    file: 'M4 2.5h5l3 3v8h-8zM9 2.5v3h3',
    color: 'M8 2.5s4.5 4.8 4.5 7.8a4.5 4.5 0 0 1-9 0C3.5 7.3 8 2.5 8 2.5z',
    eyedropper: 'M10.5 2.8l2.7 2.7-1.7 1.7-2.7-2.7zM9.2 5.6l-6 6v1.7h1.7l6-6',
    chart: 'M3 13.5h10M4.5 11V8M7.5 11V4.5M10.5 11V6.5',
    column: 'M3 2.5h10v11H3zM5 5h6M5 7.5h6M5 10h6',
    fit: 'M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10',
    move: 'M2.5 4.5h4l1.5 1.5h5.5v7h-11zM7 10h4M9.5 8.5 11 10l-1.5 1.5',
  }

  let { name }: { name: keyof typeof paths } = $props()
</script>

<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
  <path d={paths[name]} fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
</svg>

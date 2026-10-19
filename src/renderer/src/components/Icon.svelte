<script lang="ts">
  // 16px line icons drawn with the current text color.
  const paths = {
    notes: 'M4 2.5h6l2.5 2.5v8.5h-8.5zM10 2.5V5h2.5M6 8h4.5M6 10.5h4.5',
    calendar: 'M2.5 4h11v9.5h-11zM2.5 7h11M5.5 2.5v3M10.5 2.5v3',
    pin: 'M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5',
    untagged: 'M2.5 8.5V3h5.5l5.5 5.5-5 5zM5.5 6h.01M3 13l10-10',
    todo: 'M3 3h10v10H3zM5.5 8l2 2 3-4',
    tag: 'M6 2.5 4.5 13.5M11.5 2.5 10 13.5M3 6h10.5M2.5 10h10.5',
    trash: 'M3 4.5h10M6.5 4.5v-2h3v2M4.5 4.5l.7 9h5.6l.7-9',
    plus: 'M8 3v10M3 8h10',
    chevron: 'M6 4l4 4-4 4',
  }

  let { name }: { name: keyof typeof paths } = $props()
</script>

<svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
  <path d={paths[name]} fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" />
</svg>

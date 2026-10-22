<script lang="ts" module>
  export type DockTool = 'text' | 'note' | 'image' | 'chart' | 'board' | 'column' | 'color' | 'shape'
</script>

<script lang="ts">
  // The add-tools' icons in the board's dock: small colored drawings of what each tool makes,
  // like Storyflow's, rather than line icons.
  let { tool, size = 30 }: { tool: DockTool; size?: number } = $props()
</script>

<svg class="dock-icon" viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
  {#if tool === 'text'}
    <rect x="3" y="5" width="26" height="22" rx="6" fill="var(--dock-tile)" stroke="var(--dock-tile-edge)" />
    <text x="16" y="20.5" text-anchor="middle" font-size="11" font-weight="600" fill="var(--dock-ink)" font-family="-apple-system, 'Segoe UI', sans-serif">Aa</text>
  {:else if tool === 'note'}
    <path d="M8 4h11l6 6v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="#fbfbfc" stroke="#d4d4d8" />
    <path d="M19 4v4a2 2 0 0 0 2 2h4" fill="#e4e4e7" stroke="#d4d4d8" />
    <rect x="10" y="14" width="11" height="1.8" rx="0.9" fill="#a1a1aa" />
    <rect x="10" y="18" width="11" height="1.8" rx="0.9" fill="#a1a1aa" />
    <rect x="10" y="22" width="7" height="1.8" rx="0.9" fill="#a1a1aa" />
  {:else if tool === 'image'}
    <defs>
      <linearGradient id="dock-photo" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#a78bfa" />
        <stop offset="1" stop-color="#6d28d9" />
      </linearGradient>
      <clipPath id="dock-photo-clip"><rect x="3" y="5" width="26" height="22" rx="5" /></clipPath>
    </defs>
    <rect x="3" y="5" width="26" height="22" rx="5" fill="url(#dock-photo)" />
    <circle cx="21.5" cy="11.5" r="2.6" fill="#fde68a" />
    <path d="M3 28V21l7-7 5 5 4-4 10 9v4z" fill="#f5f3ff" opacity="0.92" clip-path="url(#dock-photo-clip)" />
  {:else if tool === 'chart'}
    <rect x="3" y="5" width="26" height="22" rx="5" fill="var(--dock-tile)" stroke="var(--dock-tile-edge)" />
    <rect x="8" y="15" width="4" height="8" rx="1.2" fill="#3b82f6" />
    <rect x="14" y="10" width="4" height="13" rx="1.2" fill="#f97316" />
    <rect x="20" y="13" width="4" height="10" rx="1.2" fill="#22c55e" />
  {:else if tool === 'board'}
    <path d="M3 8a2 2 0 0 1 2-2h7l3 3h12a2 2 0 0 1 2 2v2H3z" fill="#2563eb" />
    <rect x="5" y="9" width="22" height="7" rx="1.5" fill="#eef2ff" />
    <rect x="3" y="11.5" width="26" height="15.5" rx="3" fill="#3b82f6" />
    <rect x="3" y="11.5" width="26" height="1.2" rx="0.6" fill="#93c5fd" opacity="0.8" />
  {:else if tool === 'column'}
    <rect x="7" y="3" width="18" height="26" rx="4.5" fill="var(--dock-tile)" stroke="var(--dock-tile-edge)" />
    <rect x="10" y="6.5" width="1.4" height="3.5" rx="0.7" fill="#f59e0b" />
    <rect x="13" y="7.4" width="8" height="1.6" rx="0.8" fill="var(--dock-ink)" opacity="0.7" />
    <rect x="10" y="12" width="12" height="6" rx="2" fill="var(--dock-card)" />
    <rect x="10" y="20" width="12" height="6" rx="2" fill="var(--dock-card)" />
  {:else if tool === 'color'}
    {#each ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#71717a'] as fill, i (fill)}
      <rect x={5 + (i % 3) * 8} y={5 + Math.floor(i / 3) * 8} width="6" height="6" rx="1.6" {fill} />
    {/each}
  {:else if tool === 'shape'}
    <rect x="13" y="13" width="15" height="15" rx="3.5" fill="#14b8a6" />
    <circle cx="11.5" cy="11.5" r="8" fill="#ec4899" opacity="0.92" />
  {/if}
</svg>

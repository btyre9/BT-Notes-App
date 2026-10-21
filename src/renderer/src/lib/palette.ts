/**
 * The colors offered for cards, arrows and board icons, beyond the six JSON Canvas presets. They're
 * stored as hex codes, which JSON Canvas also allows, so Obsidian shows them too. Values are
 * Tailwind's (MIT): 16 hues in five shades, light to dark, and a row of neutrals.
 */
export const HUES: { name: string; shades: string[] }[] = [
  { name: 'Red', shades: ['#fecaca', '#f87171', '#ef4444', '#dc2626', '#991b1b'] },
  { name: 'Orange', shades: ['#fed7aa', '#fb923c', '#f97316', '#ea580c', '#9a3412'] },
  { name: 'Amber', shades: ['#fde68a', '#fbbf24', '#f59e0b', '#d97706', '#92400e'] },
  { name: 'Yellow', shades: ['#fef08a', '#facc15', '#eab308', '#ca8a04', '#854d0e'] },
  { name: 'Lime', shades: ['#d9f99d', '#a3e635', '#84cc16', '#65a30d', '#3f6212'] },
  { name: 'Green', shades: ['#bbf7d0', '#4ade80', '#22c55e', '#16a34a', '#166534'] },
  { name: 'Emerald', shades: ['#a7f3d0', '#34d399', '#10b981', '#059669', '#065f46'] },
  { name: 'Teal', shades: ['#99f6e4', '#2dd4bf', '#14b8a6', '#0d9488', '#115e59'] },
  { name: 'Cyan', shades: ['#a5f3fc', '#22d3ee', '#06b6d4', '#0891b2', '#155e75'] },
  { name: 'Sky', shades: ['#bae6fd', '#38bdf8', '#0ea5e9', '#0284c7', '#075985'] },
  { name: 'Blue', shades: ['#bfdbfe', '#60a5fa', '#3b82f6', '#2563eb', '#1e40af'] },
  { name: 'Indigo', shades: ['#c7d2fe', '#818cf8', '#6366f1', '#4f46e5', '#3730a3'] },
  { name: 'Violet', shades: ['#ddd6fe', '#a78bfa', '#8b5cf6', '#7c3aed', '#5b21b6'] },
  { name: 'Purple', shades: ['#e9d5ff', '#c084fc', '#a855f7', '#9333ea', '#6b21a8'] },
  { name: 'Fuchsia', shades: ['#f5d0fe', '#e879f9', '#d946ef', '#c026d3', '#86198f'] },
  { name: 'Pink', shades: ['#fbcfe8', '#f472b6', '#ec4899', '#db2777', '#9d174d'] },
]

export const NEUTRALS = ['#ffffff', '#f5f5f4', '#d6d3d1', '#a8a29e', '#78716c', '#57534e', '#292524', '#000000']

const SHADE_NAMES = ['light', 'soft', '', 'deep', 'dark']

/** A readable name for a palette color, such as "Light blue" or "Teal". */
export function colorName(hue: string, shade: number): string {
  const prefix = SHADE_NAMES[shade]
  return prefix ? `${prefix[0].toUpperCase()}${prefix.slice(1)} ${hue.toLowerCase()}` : hue
}

/**
 * True for colors light enough that dark text reads better on them than white. The cutoff is
 * lower than halfway because mid-tones such as sky blue or green read poorly with white.
 */
export function isLight(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})/i.exec(hex)
  if (!m) return false
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255)
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b) > 0.3
}

// ---- Recent custom colors, a convenience kept on this device only ----

const RECENT_KEY = 'bt-recent-colors'
const RECENT_MAX = 8

export function recentColors(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) : []
  } catch {
    return []
  }
}

export function rememberColor(hex: string): void {
  try {
    const list = [hex.toLowerCase(), ...recentColors().filter((c) => c !== hex.toLowerCase())].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(list))
  } catch {
    // Storage unavailable: the color still applies, it just isn't remembered.
  }
}

/**
 * Names for colors, the way Coolors and Storyflow name swatches: the name of the nearest color in
 * a list of about 5,000 named colors (see colorNameData.ts). "Nearest" is measured in CIELAB, so
 * it follows how different colors look rather than how different their RGB numbers are.
 */
import { COLOR_NAME_DATA } from './colorNameData.ts'

type Lab = [number, number, number]

/** sRGB hex (#rrggbb) to CIELAB, D65 white. */
function toLab(hex: string): Lab {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92
  })
  const xyz = [(r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, r * 0.2126 + g * 0.7152 + b * 0.0722, (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883]
  const [fx, fy, fz] = xyz.map((t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116))
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

/** The named colors, read from the data once, the first time a name is needed. */
let named: { name: string; lab: Lab }[] | null = null

function namedColors() {
  named ??= COLOR_NAME_DATA.split('\n').map((line) => ({ name: line.slice(6), lab: toLab(`#${line.slice(0, 6)}`) }))
  return named
}

/** `#rgb` or `#rrggbb` (with or without #) as `#rrggbb`, or null if it isn't one. */
function normalize(hex: string): string | null {
  const h = hex.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(h)) return `#${[...h].map((c) => c + c).join('')}`
  return /^[0-9a-f]{6}([0-9a-f]{2})?$/.test(h) ? `#${h.slice(0, 6)}` : null
}

/** The name of the nearest named color, or '' for something that isn't a hex color. */
export function colorName(hex: string): string {
  const color = normalize(hex)
  if (!color) return ''
  const [l, a, b] = toLab(color)
  let best = ''
  let bestDistance = Infinity
  for (const c of namedColors()) {
    const d = (c.lab[0] - l) ** 2 + (c.lab[1] - a) ** 2 + (c.lab[2] - b) ** 2
    if (d < bestDistance) {
      bestDistance = d
      best = c.name
    }
  }
  return best
}

/**
 * A swatch's name after its color changes: the new color's name if the old name was empty or the
 * old color's automatic name, else the name someone typed, which stays.
 */
export function swatchNameAfter(oldHex: string, oldName: string, newHex: string): string {
  const automatic = !oldName.trim() || oldName.trim() === colorName(oldHex)
  return automatic ? colorName(newHex) : oldName
}

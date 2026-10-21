import { describe, expect, it } from 'vitest'
import { colorName, HUES, isLight, NEUTRALS } from './palette'

describe('palette', () => {
  it('offers 16 hues in five shades plus neutrals, all distinct hex codes', () => {
    const all = [...HUES.flatMap((h) => h.shades), ...NEUTRALS]
    expect(HUES).toHaveLength(16)
    expect(HUES.every((h) => h.shades.length === 5)).toBe(true)
    expect(all.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true)
    expect(new Set(all).size).toBe(all.length)
  })

  it('names colors by shade', () => {
    expect(colorName('Blue', 0)).toBe('Light blue')
    expect(colorName('Blue', 2)).toBe('Blue')
    expect(colorName('Blue', 4)).toBe('Dark blue')
  })

  it('tells light colors, which need a dark icon, from dark ones', () => {
    expect(isLight('#ffffff')).toBe(true)
    expect(isLight('#fef08a')).toBe(true)
    expect(isLight('#38bdf8')).toBe(true)
    expect(isLight('#22c55e')).toBe(true)
    expect(isLight('#ef4444')).toBe(false)
    expect(isLight('#0d9488')).toBe(false)
    expect(isLight('#000000')).toBe(false)
    expect(isLight('#dc2626')).toBe(false)
    expect(isLight('#1e40af')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { colorName, swatchNameAfter } from './colorNames'

describe('colorName', () => {
  it('names a color in the list exactly', () => {
    expect(colorName('#0000ff')).toBe('Blue')
    expect(colorName('0000EE')).toBe('Hyperlink Blue')
  })

  it('names other colors after the nearest one', () => {
    expect(colorName('#3b82f6')).toBe('Pool Water')
    expect(colorName('#8e6e53')).toBe('Whisky Barrel')
    expect(colorName('#c8102e')).toBe('Red Tape')
  })

  it('accepts short hex codes and ignores alpha', () => {
    expect(colorName('#00f')).toBe('Blue')
    expect(colorName('#0000ff80')).toBe('Blue')
  })

  it('gives no name to something that is not a color', () => {
    expect(colorName('blue')).toBe('')
    expect(colorName('#12345')).toBe('')
  })
})

describe('swatchNameAfter', () => {
  it('follows the color when the name was automatic or empty', () => {
    expect(swatchNameAfter('#0000ff', 'Blue', '#3b82f6')).toBe('Pool Water')
    expect(swatchNameAfter('#0000ff', '', '#3b82f6')).toBe('Pool Water')
  })

  it('keeps a name someone typed', () => {
    expect(swatchNameAfter('#0000ff', 'Brand blue', '#3b82f6')).toBe('Brand blue')
  })
})

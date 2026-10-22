/**
 * The outlines of drawn shapes, on a 100 × 100 box that stretches to the card. Circle and pill are
 * rounded cards instead. A shape with two paths draws the second as a line only (a cylinder's rim).
 */
import type { Shape } from './board'

function star(points: number, outer: number, inner: number): string {
  const pts: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = (Math.PI * i) / points - Math.PI / 2
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)} ${(52 + r * Math.sin(a)).toFixed(1)}`)
  }
  return `M${pts.join(' L')}Z`
}

export const SHAPE_PATHS: Partial<Record<Shape, string[]>> = {
  diamond: ['M50 1 L99 50 L50 99 L1 50Z'],
  triangle: ['M50 2 L98.5 97.5 L1.5 97.5Z'],
  hexagon: ['M25 1.5 L75 1.5 L99 50 L75 98.5 L25 98.5 L1 50Z'],
  parallelogram: ['M20 1.5 L99 1.5 L80 98.5 L1 98.5Z'],
  star: [star(5, 49, 21)],
  database: ['M1 13 A49 12 0 0 1 99 13 L99 87 A49 12 0 0 1 1 87Z', 'M1 13 A49 12 0 0 0 99 13'],
  document: ['M1 1.5 L99 1.5 L99 86 C78 76 62 99 40 93 C24 89 12 87 1 92Z'],
}

export const SHAPE_LABELS: Record<Shape, string> = {
  circle: 'Circle',
  pill: 'Pill',
  diamond: 'Diamond',
  triangle: 'Triangle',
  hexagon: 'Hexagon',
  parallelogram: 'Parallelogram',
  star: 'Star',
  database: 'Cylinder',
  document: 'Document',
}

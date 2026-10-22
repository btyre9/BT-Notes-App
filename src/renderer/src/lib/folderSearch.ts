/**
 * Finding a folder (board) by name. Best matches first: names that start with what was typed,
 * then names with a word that starts with it, then names that contain it, then names with its
 * letters in order ("mdbd" finds Moodboard). Recently opened folders win ties. With nothing
 * typed: recent folders first, then the rest by name.
 */
import { boardName } from './board'

/** How well a name matches, lower is better; null for no match. */
function score(name: string, query: string): number | null {
  const n = name.toLowerCase()
  if (n.startsWith(query)) return 0
  if (new RegExp(`(^|[\\s_\\-–—.,(&/])${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(n)) return 1
  if (n.includes(query)) return 2
  let at = 0
  for (const ch of n) if (ch === query[at]) at++
  return at === query.length ? 3 : null
}

export function findFolders(paths: string[], query: string, recent: string[] = []): string[] {
  const q = query.trim().toLowerCase()
  const recentRank = new Map(recent.map((p, i) => [p.toLowerCase(), i]))
  const rankOf = (path: string) => recentRank.get(path.toLowerCase()) ?? Infinity
  const byName = (a: string, b: string) => boardName(a).localeCompare(boardName(b))
  if (!q) return [...paths].sort((a, b) => rankOf(a) - rankOf(b) || byName(a, b))
  return paths
    .map((path) => ({ path, score: score(boardName(path), q) }))
    .filter((hit): hit is { path: string; score: number } => hit.score !== null)
    .sort((a, b) => a.score - b.score || rankOf(a.path) - rankOf(b.path) || boardName(a.path).length - boardName(b.path).length || byName(a.path, b.path))
    .map((hit) => hit.path)
}

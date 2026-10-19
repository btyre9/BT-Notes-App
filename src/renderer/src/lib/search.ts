import MiniSearch from 'minisearch'
import type { Note } from './note'

export type SearchIndex = MiniSearch<Note>

export function createIndex(): SearchIndex {
  return new MiniSearch<Note>({
    fields: ['title', 'body', 'tags'],
    extractField: (note, field) => {
      const value = note[field as keyof Note]
      return Array.isArray(value) ? value.join(' ') : String(value ?? '')
    },
    searchOptions: { prefix: true, fuzzy: 0.15, boost: { title: 3 }, combineWith: 'AND' },
  })
}

export function upsert(index: SearchIndex, note: Note): void {
  if (index.has(note.id)) index.replace(note)
  else index.add(note)
}

export function remove(index: SearchIndex, id: string): void {
  if (index.has(id)) index.discard(id)
}

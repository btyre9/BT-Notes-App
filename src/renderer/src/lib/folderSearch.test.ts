import { describe, expect, it } from 'vitest'
import { findFolders } from './folderSearch'

const paths = ['Boards/Home.canvas', 'Boards/Moodboard.canvas', 'Boards/Interior design.canvas', 'Boards/Spaces.canvas', 'Boards/Board 1.canvas', 'Boards/Campaign Brief.canvas']
const names = (list: string[]) => list.map((p) => p.slice(7, -7))

describe('findFolders', () => {
  it('puts names that start with the query first, then word starts, then the rest', () => {
    expect(names(findFolders(paths, 'b'))).toEqual(['Board 1', 'Campaign Brief', 'Moodboard'])
    expect(names(findFolders(paths, 'design'))).toEqual(['Interior design'])
    expect(names(findFolders(paths, 'oar'))).toEqual(['Board 1', 'Moodboard'])
  })

  it('matches letters in order, ignoring case', () => {
    expect(names(findFolders(paths, 'MDBD'))).toEqual(['Moodboard'])
    expect(findFolders(paths, 'xyz')).toEqual([])
  })

  it('breaks ties with recently opened folders', () => {
    expect(names(findFolders(paths, 'b', ['Boards/campaign brief.canvas']))).toEqual(['Board 1', 'Campaign Brief', 'Moodboard'])
    expect(names(findFolders(['Boards/Kitchen.canvas', 'Boards/Kids.canvas'], 'ki', ['Boards/Kitchen.canvas']))).toEqual(['Kitchen', 'Kids'])
  })

  it('lists recent folders first, then the rest by name, when nothing is typed', () => {
    expect(names(findFolders(paths, '  ', ['Boards/Spaces.canvas', 'Boards/Moodboard.canvas']))).toEqual([
      'Spaces',
      'Moodboard',
      'Board 1',
      'Campaign Brief',
      'Home',
      'Interior design',
    ])
  })

  it('treats regex characters in the query as text', () => {
    expect(findFolders(['Boards/Q&A (draft).canvas'], '(draft')).toEqual(['Boards/Q&A (draft).canvas'])
  })
})

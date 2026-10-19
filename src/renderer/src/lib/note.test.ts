import { describe, expect, it } from 'vitest'
import {
  buildTagTree,
  fileNameFor,
  linksOf,
  parseNote,
  plainLine,
  rewriteLinks,
  setFrontmatterValue,
  splitFrontmatter,
  tagsOf,
  tasksOf,
  titleOf,
} from './note'
import { createIndex, upsert } from './search'

describe('titleOf', () => {
  it('uses the first non-empty line without heading marks', () => {
    expect(titleOf('\n\n## Weekly sync\nbody')).toBe('Weekly sync')
    expect(titleOf('Plain first line\nmore')).toBe('Plain first line')
    expect(titleOf('# \n')).toBe('')
  })
})

describe('tagsOf', () => {
  it('finds nested tags and ignores headings, code and mid-word hashes', () => {
    const body = '# Title\n#work/meetings and #Ideas\nissue#12\n`#notatag`\n```\n#alsonot\n```\n## Heading'
    expect(tagsOf(body)).toEqual(['ideas', 'work/meetings'])
  })
})

describe('links', () => {
  it('finds link targets, drops aliases and ignores code', () => {
    const body = 'See [[Project X]] and [[Kickoff|the kickoff]].\n`[[not a link]]`\n[[ Project X ]]'
    expect(linksOf(body)).toEqual(['Project X', 'Kickoff'])
  })

  it('rewrites links to a renamed note, keeping aliases and leaving others alone', () => {
    const body = 'A [[untitled 2]] B [[Untitled 2|draft]] C [[Other]]'
    expect(rewriteLinks(body, ['Untitled 2'], 'Kickoff')).toBe('A [[Kickoff]] B [[Kickoff|draft]] C [[Other]]')
  })
})

describe('plainLine', () => {
  it('shows link labels and drops Markdown marks', () => {
    expect(plainLine('- [ ] Review **draft** with `HV-team` in [[Taycan plan|the plan]]')).toBe(
      'Review draft with HV-team in the plan',
    )
    expect(plainLine('> [!note]- See [[Kickoff]]')).toBe('See Kickoff')
  })
})

describe('tasksOf', () => {
  it('reads open and done tasks with their due dates and line numbers', () => {
    const body = '# Plan\n- [ ] Draft storyboard 📅 2026-10-21\n- [x] Collect photos\nnot a task\n  * [ ] Nested one'
    expect(tasksOf(body)).toEqual([
      { line: 1, text: 'Draft storyboard', done: false, due: '2026-10-21' },
      { line: 2, text: 'Collect photos', done: true, due: undefined },
      { line: 4, text: 'Nested one', done: false, due: undefined },
    ])
  })
})

describe('front matter', () => {
  it('splits it from the body and updates values in place', () => {
    const { frontmatter, body } = splitFrontmatter('---\ncreated: 2026-10-19\n---\n# Hi\n')
    expect(body).toBe('# Hi\n')
    const pinned = setFrontmatterValue(frontmatter, 'pinned', 'true')
    expect(pinned).toBe('---\ncreated: 2026-10-19\npinned: true\n---\n')
    expect(setFrontmatterValue(pinned, 'pinned', 'false')).toBe('---\ncreated: 2026-10-19\npinned: false\n---\n')
    expect(setFrontmatterValue('', 'pinned', 'true')).toBe('---\npinned: true\n---\n')
  })

  it('reads pinned from front matter', () => {
    const note = parseNote('1', { path: 'a.md', content: '---\npinned: true\n---\n# A', mtime: 0 })
    expect(note.pinned).toBe(true)
    expect(note.title).toBe('A')
  })
})

describe('fileNameFor', () => {
  it('removes characters Windows and Drive reject', () => {
    expect(fileNameFor('Q3: plan / review?')).toBe('Q3 plan review')
    expect(fileNameFor('   ')).toBe('Untitled')
    expect(fileNameFor('con')).toBe('con note')
    expect(fileNameFor('Ends with dots...')).toBe('Ends with dots')
  })

  it('never produces a hidden dot-file name', () => {
    expect(fileNameFor('.NET upgrade plan')).toBe('NET upgrade plan')
    expect(fileNameFor('...')).toBe('Untitled')
  })

  it('cuts long titles without splitting an emoji', () => {
    const name = fileNameFor(`${'a'.repeat(79)}😀 and more`)
    expect(name).toBe(`${'a'.repeat(79)}😀`)
    expect(name.isWellFormed()).toBe(true)
  })
})

describe('buildTagTree', () => {
  it('nests child tags and counts each note once per parent', () => {
    const notes = [
      parseNote('1', { path: 'a.md', content: '#work/meetings #work/projects', mtime: 0 }),
      parseNote('2', { path: 'b.md', content: '#work', mtime: 0 }),
    ]
    const [work] = buildTagTree(notes)
    expect(work.count).toBe(2)
    expect(work.children.map((c) => [c.name, c.count])).toEqual([
      ['meetings', 1],
      ['projects', 1],
    ])
  })
})

describe('search', () => {
  it('searches 5,000 notes in under 50 ms', () => {
    const words = 'engine brake battery voltage service porsche taycan meeting agenda review draft budget'.split(' ')
    const index = createIndex()
    for (let i = 0; i < 5000; i++) {
      const text = Array.from({ length: 150 }, (_, j) => words[(i * 7 + j * 13) % words.length]).join(' ')
      upsert(index, parseNote(String(i), { path: `n${i}.md`, content: `# Note ${i}\n${text} #tag${i % 40}`, mtime: i }))
    }
    index.search('warmup')
    const start = performance.now()
    const results = index.search('battery volt')
    const elapsed = performance.now() - start
    expect(results.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(50)
  })
})

import { describe, expect, it } from 'vitest'
import {
  boardName,
  colorOf,
  dropIntoColumn,
  duplicate,
  edgeShape,
  edgeStyle,
  setEdgeStyle,
  type CanvasEdge,
  facingSides,
  freeSpot,
  kindOf,
  layoutColumns,
  nearestSide,
  parseBoard,
  removeNodes,
  renameFile,
  serializeBoard,
  setSwatch,
  swatchOf,
  type CanvasNode,
} from './board'

const node = (fields: Partial<CanvasNode>): CanvasNode => ({ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, ...fields })

describe('parseBoard', () => {
  it('reads an Obsidian board and keeps fields this app does not use', () => {
    const content = JSON.stringify({
      nodes: [{ id: 'n1', type: 'text', text: 'Hi', x: 10, y: 20, width: 250, height: 60, styleAttributes: { shape: 'pill' } }],
      edges: [{ id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'n1', toSide: 'left' }],
      metadata: { version: '1.0' },
    })
    const board = parseBoard(content)!
    expect(board.nodes[0].styleAttributes).toEqual({ shape: 'pill' })
    expect(board.edges[0].fromSide).toBe('right')
    expect(board.metadata).toEqual({ version: '1.0' })
    expect(JSON.parse(serializeBoard(board))).toEqual(JSON.parse(content))
  })

  it('reads a board saved with a byte order mark', () => {
    expect(parseBoard('﻿{"nodes":[],"edges":[]}')).toEqual({ nodes: [], edges: [] })
  })

  it('treats an empty file as an empty board', () => {
    expect(parseBoard('')).toEqual({ nodes: [], edges: [] })
  })

  it('refuses files that are not boards, so they are never overwritten', () => {
    expect(parseBoard('{ not json')).toBeNull()
    expect(parseBoard('[1, 2]')).toBeNull()
  })

  it('fills in missing positions and drops broken arrows', () => {
    const board = parseBoard(JSON.stringify({ nodes: [{ id: 'n1', type: 'text' }], edges: [{ id: 'e1', fromNode: 'n1' }] }))!
    expect(board.nodes[0]).toMatchObject({ x: 0, y: 0, width: 250, height: 60 })
    expect(board.edges).toEqual([])
  })
})

describe('serializeBoard', () => {
  it('writes tab-indented JSON like Obsidian', () => {
    expect(serializeBoard({ nodes: [], edges: [] })).toBe('{\n\t"nodes": [],\n\t"edges": []\n}')
  })
})

describe('kindOf', () => {
  it('tells cards apart by type and file extension', () => {
    expect(kindOf(node({ type: 'file', file: 'Notes/Plan.md' }))).toBe('note')
    expect(kindOf(node({ type: 'file', file: 'Boards/Ideas.canvas' }))).toBe('board')
    expect(kindOf(node({ type: 'file', file: 'Attachments/Kitchen.JPG' }))).toBe('image')
    expect(kindOf(node({ type: 'file', file: 'Attachments/spec.PDF' }))).toBe('pdf')
    expect(kindOf(node({ type: 'file', file: 'Attachments/IMG_0042.MOV' }))).toBe('video')
    expect(kindOf(node({ type: 'file', file: 'Attachments/Outline.docx' }))).toBe('file')
    expect(kindOf(node({ type: 'link', url: 'https://example.com' }))).toBe('link')
    expect(kindOf(node({ type: 'group' }))).toBe('group')
    expect(kindOf(node({ type: 'text' }))).toBe('text')
  })
})

describe('removeNodes', () => {
  it('removes the cards and every arrow attached to them', () => {
    const data = {
      nodes: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })],
      edges: [
        { id: 'ab', fromNode: 'a', toNode: 'b' },
        { id: 'bc', fromNode: 'b', toNode: 'c' },
        { id: 'ca', fromNode: 'c', toNode: 'a' },
      ],
    }
    removeNodes(data, new Set(['a']))
    expect(data.nodes.map((n) => n.id)).toEqual(['b', 'c'])
    expect(data.edges.map((e) => e.id)).toEqual(['bc'])
  })
})

describe('renameFile', () => {
  it('points file cards at the new path, ignoring case', () => {
    const data = { nodes: [node({ type: 'file', file: 'Notes/untitled.md' }), node({ id: 'b', type: 'text', text: 'Notes/Untitled.md' })], edges: [] }
    expect(renameFile(data, 'Notes/Untitled.md', 'Notes/Plan.md')).toBe(true)
    expect(data.nodes[0].file).toBe('Notes/Plan.md')
    expect(data.nodes[1].text).toBe('Notes/Untitled.md')
    expect(renameFile(data, 'Notes/Other.md', 'Notes/X.md')).toBe(false)
  })
})

describe('freeSpot', () => {
  it('centers a card on the point when that spot is clear', () => {
    expect(freeSpot([], 100, 100, 200, 100)).toEqual({ x: 0, y: 50 })
  })

  it('moves to the nearest clear spot instead of covering another card', () => {
    const taken = node({ x: 0, y: 50, width: 200, height: 100 })
    expect(freeSpot([taken], 100, 100, 200, 100)).toEqual({ x: 224, y: 50 })
    const right = node({ x: 224, y: 50, width: 200, height: 100 })
    expect(freeSpot([taken, right], 100, 100, 200, 100)).toEqual({ x: 0, y: 174 })
  })
})

describe('boardName', () => {
  it('drops the folder and extension', () => {
    expect(boardName('Boards/Kitchen ideas.canvas')).toBe('Kitchen ideas')
  })
})

describe('columns', () => {
  const column = (fields: Partial<CanvasNode> = {}) =>
    node({ id: 'col', type: 'group', label: 'To do', btColumn: true, x: 0, y: 0, width: 300, height: 100, ...fields })

  it('stacks its cards top to bottom at its width and fits its height', () => {
    const data = {
      nodes: [column({ btCards: ['b', 'a'] }), node({ id: 'a', height: 50 }), node({ id: 'b', height: 80, x: 900, y: 900 })],
      edges: [],
    }
    layoutColumns(data)
    const [col, a, b] = data.nodes
    expect([b.x, b.y, b.width]).toEqual([14, 48, 272])
    expect([a.x, a.y, a.width]).toEqual([14, 48 + 80 + 12, 272])
    expect(col.height).toBe(48 + 80 + 12 + 50 + 14)
  })

  it('keeps images in shape', () => {
    const data = { nodes: [column({ btCards: ['img'] }), node({ id: 'img', type: 'file', file: 'Attachments/a.jpg', width: 400, height: 300 })], edges: [] }
    layoutColumns(data)
    expect([data.nodes[1].width, data.nodes[1].height]).toEqual([272, 204])
  })

  it('works out the order from positions when another app dropped the list', () => {
    const data = { nodes: [column({ height: 400 }), node({ id: 'low', x: 20, y: 300 }), node({ id: 'high', x: 20, y: 60 }), node({ id: 'out', x: 900 })], edges: [] }
    layoutColumns(data)
    expect(data.nodes[0].btCards).toEqual(['high', 'low'])
  })

  it('forgets cards that were deleted and is empty-sized with none', () => {
    const data = { nodes: [column({ btCards: ['gone'] })], edges: [] }
    layoutColumns(data)
    expect(data.nodes[0].btCards).toEqual([])
    expect(data.nodes[0].height).toBe(48 + 64)
  })

  it('drops cards in where the pointer is, and closes up the column they left', () => {
    const data = {
      nodes: [
        column({ btCards: ['a', 'b'] }),
        column({ id: 'other', x: 500, btCards: ['c'] }),
        node({ id: 'a' }),
        node({ id: 'b' }),
        node({ id: 'c' }),
      ],
      edges: [],
    }
    layoutColumns(data)
    // Between a (y 48–98) and b (y 110–160).
    expect(dropIntoColumn(data, ['c'], { x: 100, y: 100 })?.id).toBe('col')
    expect(data.nodes[0].btCards).toEqual(['a', 'c', 'b'])
    expect(data.nodes[1].btCards).toEqual([])
    // Just below the column still counts.
    expect(dropIntoColumn(data, ['c'], { x: 100, y: data.nodes[0].y + data.nodes[0].height + 30 })?.id).toBe('col')
    expect(data.nodes[0].btCards).toEqual(['a', 'b', 'c'])
    expect(dropIntoColumn(data, ['a'], { x: 2000, y: 2000 })).toBeNull()
    expect(data.nodes[0].btCards).toEqual(['b', 'c'])
    expect(data.nodes[3].y).toBe(48)
  })
})

describe('arrows', () => {
  const a = { x: 0, y: 0, width: 100, height: 50 }
  const b = { x: 300, y: 0, width: 100, height: 50 }

  it('picks the sides that face each other', () => {
    expect(facingSides(a, b)).toEqual(['right', 'left'])
    expect(facingSides(a, { x: 0, y: 300, width: 100, height: 50 })).toEqual(['bottom', 'top'])
    // A wide, short card beside a tall one, a little higher: still joined side to side.
    expect(facingSides({ x: 0, y: 0, width: 276, height: 45 }, { x: 300, y: -40, width: 210, height: 160 })).toEqual(['right', 'left'])
  })

  it('finds the side nearest a point', () => {
    expect(nearestSide(b, { x: 290, y: 20 })).toBe('left')
    expect(nearestSide(b, { x: 350, y: 60 })).toBe('bottom')
  })

  it('runs from side to side, with an arrowhead only at the end by default', () => {
    const shape = edgeShape(a, 'right', b, 'left', { start: false, end: true })
    expect(shape.d.startsWith('M100,25 ')).toBe(true)
    expect(shape.d.endsWith(' 300,25')).toBe(true)
    expect(shape.startHead).toBe('')
    expect(shape.endHead.startsWith('M300,25 ')).toBe(true)
    expect(shape.mid).toEqual({ x: 200, y: 25 })
  })
})

describe('arrow styles', () => {
  const a = { x: 0, y: 0, width: 100, height: 50 }
  const b = { x: 300, y: 200, width: 100, height: 50 }
  const ends = { start: false, end: true }

  it('draws a straight line side to side, with the head along it', () => {
    const shape = edgeShape(a, 'right', b, 'left', ends, 14, { line: 'straight', head: 'filled' })
    expect(shape.d).toBe('M100,25 L300,225')
    expect(shape.mid).toEqual({ x: 200, y: 125 })
    expect(shape.endHead.startsWith('M300,225 ')).toBe(true)
  })

  it('draws an elbow line out of each side with right-angled, rounded turns', () => {
    const shape = edgeShape(a, 'right', b, 'left', ends, 14, { line: 'elbow', head: 'filled' })
    // Out of the right side, across to halfway, down, then into the left side.
    expect(shape.d.startsWith('M100,25 L')).toBe(true)
    expect(shape.d).toContain('Q200,25 ')
    expect(shape.d).toContain('Q200,225 ')
    expect(shape.d.endsWith(' L300,225')).toBe(true)
    // The head points straight in, from the left.
    expect(shape.endHead.startsWith('M300,225 L286,')).toBe(true)
    expect(shape.mid).toEqual({ x: 200, y: 125 })
  })

  it('turns once toward a point while an elbow line is being drawn', () => {
    const shape = edgeShape(a, 'right', { x: 300, y: 200 }, null, ends, 14, { line: 'elbow', head: 'filled' })
    expect(shape.d).toContain('Q300,25 ')
    expect(shape.d.endsWith(' L300,200')).toBe(true)
  })

  it('draws open heads as two strokes and closed ones as triangles', () => {
    const open = edgeShape(a, 'right', b, 'left', ends, 14, { line: 'straight', head: 'open' }).endHead
    const closed = edgeShape(a, 'right', b, 'left', ends, 14, { line: 'straight', head: 'closed' }).endHead
    expect(open.endsWith('Z')).toBe(false)
    expect(open).toContain('L300,225 L')
    expect(closed.endsWith('Z')).toBe(true)
  })

  it('reads defaults, and keeps defaults out of the file', () => {
    const edge: CanvasEdge = { id: 'e', fromNode: 'a', toNode: 'b' }
    expect(edgeStyle(edge)).toEqual({ line: 'curved', pattern: 'solid', weight: 'medium', head: 'filled', ends: 'end' })
    setEdgeStyle(edge, { line: 'elbow', pattern: 'dotted', weight: 'thick', head: 'open', ends: 'both' })
    expect(edge).toEqual({ id: 'e', fromNode: 'a', toNode: 'b', btLine: 'elbow', btPattern: 'dotted', btWeight: 'thick', btHead: 'open', fromEnd: 'arrow' })
    expect(edgeStyle(edge)).toEqual({ line: 'elbow', pattern: 'dotted', weight: 'thick', head: 'open', ends: 'both' })
    setEdgeStyle(edge, { line: 'curved', pattern: 'solid', weight: 'medium', head: 'filled', ends: 'end' })
    expect(edge).toEqual({ id: 'e', fromNode: 'a', toNode: 'b' })
  })

  it('stores arrowheads in JSON Canvas fields', () => {
    const edge: CanvasEdge = { id: 'e', fromNode: 'a', toNode: 'b' }
    setEdgeStyle(edge, { ends: 'none' })
    expect([edge.fromEnd, edge.toEnd]).toEqual([undefined, 'none'])
    setEdgeStyle(edge, { ends: 'start' })
    expect([edge.fromEnd, edge.toEnd]).toEqual(['arrow', 'none'])
    expect(edgeStyle(edge).ends).toBe('start')
  })

  it('ignores styles it does not know', () => {
    expect(edgeStyle({ id: 'e', fromNode: 'a', toNode: 'b', btLine: 'zigzag', btWeight: 7 }).line).toBe('curved')
  })
})

describe('review fixes', () => {
  it('keeps image shapes exact while a column is resized in small steps', () => {
    const img = (id: string, w: number, h: number) => node({ id, type: 'file', file: `Attachments/${id}.jpg`, width: w, height: h })
    const data = {
      nodes: [node({ id: 'col', type: 'group', btColumn: true, btCards: ['wide', 'banner'], width: 300 }), img('wide', 1600, 900), img('banner', 800, 200)],
      edges: [],
    }
    layoutColumns(data)
    const ratios = new Map(data.nodes.slice(1).map((n) => [n.id, n.height / n.width]))
    for (let w = 299; w >= 150; w--) {
      data.nodes[0].width = w
      layoutColumns(data, ratios)
    }
    expect([data.nodes[1].width, data.nodes[1].height]).toEqual([122, 69])
    expect([data.nodes[2].width, data.nodes[2].height]).toEqual([122, 31])
  })

  it('does not drop cards into a column that is moving with them', () => {
    const data = {
      nodes: [node({ id: 'col', type: 'group', btColumn: true, btCards: [], width: 300, height: 200 }), node({ id: 'loose', x: 50, y: 50 })],
      edges: [],
    }
    expect(dropIntoColumn(data, ['loose'], { x: 100, y: 100 }, new Set(['col']))).toBeNull()
    expect(data.nodes[0].btCards).toEqual([])
  })

  it('lists a card in a column only once', () => {
    const data = { nodes: [node({ id: 'col', type: 'group', btColumn: true, btCards: ['a', 'a'] }), node({ id: 'a', height: 50 })], edges: [] }
    layoutColumns(data)
    expect(data.nodes[0].btCards).toEqual(['a'])
    expect(data.nodes[0].height).toBe(48 + 50 + 14)
  })

  it('gives repeated or missing card and arrow ids new ones', () => {
    const board = parseBoard(
      JSON.stringify({
        nodes: [{ id: 'x', type: 'text' }, { id: 'x', type: 'text' }],
        edges: [{ fromNode: 'x', toNode: 'x' }, { fromNode: 'x', toNode: 'x' }],
      }),
    )!
    const ids = [...board.nodes, ...board.edges].map((i) => i.id)
    expect(new Set(ids).size).toBe(4)
    expect(board.nodes[0].id).toBe('x')
  })

  it('points the arrowhead of an arrow being drawn at the pointer', () => {
    const shape = edgeShape({ x: 0, y: 0, width: 100, height: 50 }, 'right', { x: 300, y: 25 }, null, { start: false, end: true })
    expect(shape.endHead).not.toMatch(/^M300,25 L300,25/)
  })
})

describe('swatches', () => {
  it('reads the color and name, and writes the hex code as text for Obsidian', () => {
    const card = node({ type: 'text', btSwatch: true })
    setSwatch(card, '#C8102E', 'Guards Red')
    expect(card).toMatchObject({ color: '#c8102e', text: '#C8102E\nGuards Red' })
    expect(kindOf(card)).toBe('swatch')
    expect(swatchOf(card)).toEqual({ hex: '#c8102e', name: 'Guards Red' })
  })

  it('copes with short hex codes, preset colors and text edited elsewhere', () => {
    expect(swatchOf(node({ btSwatch: true, color: '#abc', text: 'Sky' }))).toEqual({ hex: '#aabbcc', name: 'Sky' })
    expect(swatchOf(node({ btSwatch: true, color: '1', text: '#E5484D' }))).toEqual({ hex: '#e5484d', name: '' })
  })
})

describe('names that are also built-in object properties', () => {
  it('are not colors or icons', async () => {
    const { boardIconOf } = await import('./boardIcons')
    expect(colorOf('constructor')).toBeNull()
    expect(colorOf('__proto__')).toBeNull()
    expect(boardIconOf({ nodes: [], edges: [], btIcon: { icon: 'constructor', color: 'toString' } })).toEqual({})
  })
})

describe('duplicate', () => {
  it('copies cards with new ids, the arrows between them, and columns with their cards', () => {
    const data = {
      nodes: [
        node({ id: 'col', type: 'group', btColumn: true, btCards: ['a'] }),
        node({ id: 'a', text: 'In the column' }),
        node({ id: 'b', text: 'Linked' }),
        node({ id: 'c', text: 'Not copied' }),
      ],
      edges: [
        { id: 'ab', fromNode: 'a', toNode: 'b', label: 'goes to' },
        { id: 'bc', fromNode: 'b', toNode: 'c' },
      ],
    }
    const { nodes, edges, ids } = duplicate(data, data.nodes.slice(0, 3))
    expect(nodes.map((n) => n.text ?? n.type)).toEqual(['group', 'In the column', 'Linked'])
    expect(nodes.every((n) => !['col', 'a', 'b'].includes(n.id))).toBe(true)
    expect(nodes[0].btCards).toEqual([ids.get('a')])
    expect(edges).toEqual([{ id: expect.any(String), fromNode: ids.get('a'), toNode: ids.get('b'), label: 'goes to' }])
    // The originals are untouched.
    expect(data.nodes[0].btCards).toEqual(['a'])
  })
})

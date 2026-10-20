import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addCards, createBoard, listBoards, NotesFolder, readBoard, removeCards, updateCards } from './boards.ts'
import { imageSize } from './imageSize.ts'

let root: string
let outside: string
let folder: NotesFolder
const board = (rel: string) => JSON.parse(readFileSync(join(root, rel), 'utf8'))

/** A minimal PNG header: enough for imageSize, not a real picture. */
function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33)
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b)
  b.writeUInt32BE(13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

/** A minimal JPEG: an EXIF block with an orientation, then a frame header with the size. */
function jpeg(width: number, height: number, orientation: number): Buffer {
  const tiff = Buffer.alloc(26)
  tiff.write('II', 0, 'ascii')
  tiff.writeUInt16LE(42, 2)
  tiff.writeUInt32LE(8, 4)
  tiff.writeUInt16LE(1, 8)
  tiff.writeUInt16LE(0x0112, 10)
  tiff.writeUInt16LE(3, 12)
  tiff.writeUInt32LE(1, 14)
  tiff.writeUInt16LE(orientation, 18)
  const exif = Buffer.concat([Buffer.from('Exif\0\0', 'ascii'), tiff])
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.from([(exif.length + 2) >> 8, (exif.length + 2) & 255]), exif])
  const sof = Buffer.from([0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app1, sof])
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'bt-mcp-'))
  outside = mkdtempSync(join(tmpdir(), 'bt-mcp-images-'))
  mkdirSync(join(root, 'Notes'))
  writeFileSync(join(root, 'Notes', 'Plan.md'), '# Kitchen plan\n\nTile first.')
  folder = new NotesFolder(root)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(outside, { recursive: true, force: true })
})

describe('imageSize', () => {
  it('reads PNG sizes and turns sideways phone photos upright', async () => {
    writeFileSync(join(outside, 'a.png'), png(1600, 900))
    writeFileSync(join(outside, 'b.jpg'), jpeg(4032, 3024, 6))
    writeFileSync(join(outside, 'c.jpg'), jpeg(4032, 3024, 1))
    expect(await imageSize(join(outside, 'a.png'))).toEqual({ width: 1600, height: 900 })
    expect(await imageSize(join(outside, 'b.jpg'))).toEqual({ width: 3024, height: 4032 })
    expect(await imageSize(join(outside, 'c.jpg'))).toEqual({ width: 4032, height: 3024 })
  })
})

describe('MCP board tools', () => {
  it('lists Home even before it exists', async () => {
    expect(await listBoards(folder)).toEqual([{ board: 'Boards/Home.canvas', name: 'Home', cards: 0, columns: [] }])
  })

  it('builds a mood board: images copied in, a column of notes, swatches and an arrow', async () => {
    writeFileSync(join(outside, 'kitchen.png'), png(1600, 900))
    const { board: path } = await createBoard(folder, 'Kitchen', { icon: 'house', color: '4' }, 'Home')
    const result = await addCards(
      folder,
      'kitchen',
      [
        { ref: 'photo', kind: 'image', path: join(outside, 'kitchen.png') },
        { ref: 'todo', kind: 'column', name: 'To do' },
        { kind: 'text', text: 'Pick tile', column: 'todo' },
        { ref: 'plan', kind: 'note', path: 'Notes/Plan.md', column: 'To do' },
        { kind: 'note', title: 'Budget', text: 'About $20k', column: 'todo' },
        { kind: 'swatch', color: '#c8102e', name: 'Guards Red' },
        { kind: 'text', text: '```mermaid\npie\n  "A" : 1\n```' },
      ],
      [{ from: 'photo', to: 'plan', label: 'inspires' }],
    )
    expect(path).toBe('Boards/Kitchen.canvas')

    const data = board(path)
    const photo = data.nodes.find((n: { file?: string }) => n.file === 'Attachments/kitchen.png')
    expect([photo.width, photo.height]).toEqual([320, 180])
    expect(existsSync(join(root, 'Attachments', 'kitchen.png'))).toBe(true)
    expect(existsSync(join(root, 'Notes', 'Budget.md'))).toBe(true)

    const column = data.nodes.find((n: { btColumn?: boolean }) => n.btColumn)
    expect(column.label).toBe('To do')
    expect(column.btCards).toHaveLength(3)
    expect(data.edges).toEqual([expect.objectContaining({ fromSide: 'right', toSide: 'left', label: 'inspires' })])
    expect(result.cards.map((c) => c.ref).filter(Boolean)).toEqual(['photo', 'todo', 'plan'])

    // The new board is on Home and has its icon.
    expect(board('Boards/Home.canvas').nodes[0]).toMatchObject({ type: 'file', file: 'Boards/Kitchen.canvas' })
    expect(data.btIcon).toEqual({ icon: 'house', color: '4' })

    const read = await readBoard(folder, 'Kitchen')
    expect(read.cards.find((c) => c.kind === 'note' && c.file === 'Notes/Plan.md')?.note_title).toBe('Kitchen plan')
    expect(read.cards.find((c) => c.kind === 'swatch')?.swatch).toEqual({ hex: '#c8102e', name: 'Guards Red' })
  })

  it('changes and removes cards by id', async () => {
    const { cards } = await addCards(folder, 'Home', [{ kind: 'text', text: 'Draft' }, { kind: 'swatch', color: '#000000' }])
    await updateCards(folder, 'Home', [{ id: cards[0].id, text: 'Final' }, { id: cards[1].id, color: '#ffffff', name: 'White' }])
    let data = board('Boards/Home.canvas')
    expect(data.nodes[0].text).toBe('Final')
    expect(data.nodes[1]).toMatchObject({ color: '#ffffff', text: '#FFFFFF\nWhite' })
    await removeCards(folder, 'Home', [cards[0].id])
    data = board('Boards/Home.canvas')
    expect(data.nodes).toHaveLength(1)
  })

  it('refuses paths outside the notes folder, unknown boards, and board files it cannot read', async () => {
    await expect(addCards(folder, 'Home', [{ kind: 'note', path: '../secret.md' }])).rejects.toThrow('outside the notes folder')
    await expect(readBoard(folder, 'Nope')).rejects.toThrow('no board called')
    mkdirSync(join(root, 'Boards'), { recursive: true })
    writeFileSync(join(root, 'Boards', 'Broken.canvas'), '{ oops')
    await expect(addCards(folder, 'Broken', [{ kind: 'text', text: 'x' }])).rejects.toThrow("isn't a valid board")
    expect(readFileSync(join(root, 'Boards', 'Broken.canvas'), 'utf8')).toBe('{ oops')
  })
})

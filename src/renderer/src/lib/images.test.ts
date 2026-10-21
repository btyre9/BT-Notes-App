import { describe, expect, it } from 'vitest'
import { imageLinks, imagePath, imageUrl, onlyImages } from './images'

describe('imageLinks', () => {
  it('finds Markdown images, including <bracketed> targets and titles', () => {
    const text = 'Before ![a photo](Attachments/My%20photo.png "Kitchen") and ![](<Attachments/Two words.jpg>)'
    expect(imageLinks(text)).toEqual([
      { from: 7, to: 55, src: 'Attachments/My%20photo.png', encoded: true, alt: 'a photo' },
      { from: 60, to: 92, src: 'Attachments/Two words.jpg', encoded: true, alt: '' },
    ])
  })

  it('keeps parentheses that are part of the file name', () => {
    expect(imageLinks('![](Attachments/Scan%20(2).heic)')[0].src).toBe('Attachments/Scan%20(2).heic')
  })

  it('finds Obsidian embeds with an optional width', () => {
    expect(imageLinks('![[Attachments/My photo.png|300]] ![[cat.gif|Cat]]')).toEqual([
      { from: 0, to: 33, src: 'Attachments/My photo.png', encoded: false, alt: '', width: 300 },
      { from: 34, to: 50, src: 'cat.gif', encoded: false, alt: 'Cat', width: undefined },
    ])
  })

  it('skips links to files that are not images, and plain links', () => {
    expect(imageLinks('![](Attachments/Bill.pdf) ![[Other note]] [photo](a.png) [[a.png]]')).toEqual([])
  })
})

describe('onlyImages', () => {
  it('is true when nothing but images and spaces is on the line', () => {
    const line = '  ![](a.png) ![[b.jpg]] '
    expect(onlyImages(line, imageLinks(line))).toBe(true)
    const mixed = 'See ![](a.png)'
    expect(onlyImages(mixed, imageLinks(mixed))).toBe(false)
    expect(onlyImages('', [])).toBe(false)
  })
})

describe('imagePath', () => {
  const md = (src: string) => ({ src, encoded: true })

  it('decodes %-escapes in Markdown targets and keeps Obsidian targets as written', () => {
    expect(imagePath(md('Attachments/My%20photo%20%2350.png'), 'Inbox/Note.md')).toBe('Attachments/My photo #50.png')
    expect(imagePath({ src: 'Attachments/100%.png', encoded: false }, null)).toBe('Attachments/100%.png')
    expect(imagePath(md('Attachments/100%.png'), null)).toBe('Attachments/100%.png')
  })

  it('resolves from the notes folder, or from the note for ./ and ../ paths', () => {
    expect(imagePath(md('/Attachments/a.png'), 'Inbox/Note.md')).toBe('Attachments/a.png')
    expect(imagePath(md('../Attachments/a.png'), 'Inbox/Note.md')).toBe('Attachments/a.png')
    expect(imagePath(md('./pics/a.png'), 'Inbox/Note.md')).toBe('Inbox/pics/a.png')
    expect(imagePath(md('Attachments/./x/../a.png?raw=1'), null)).toBe('Attachments/a.png')
  })

  it('refuses web addresses and paths outside the notes folder', () => {
    expect(imagePath(md('https://example.com/a.png'), null)).toBeNull()
    expect(imagePath(md('file:///Users/me/a.png'), null)).toBeNull()
    expect(imagePath(md('C:/Users/me/a.png'), null)).toBeNull()
    expect(imagePath(md('../../a.png'), 'Inbox/Note.md')).toBeNull()
    expect(imagePath(md('../a.png'), 'Note.md')).toBeNull()
  })
})

describe('imageUrl', () => {
  it('encodes each path segment and previews formats the window cannot draw', () => {
    expect(imageUrl('Attachments/My photo #1.png')).toBe('btfile://file/Attachments/My%20photo%20%231.png')
    expect(imageUrl('Attachments/IMG 1.HEIC')).toBe('btfile://thumb/Attachments/IMG%201.HEIC?w=800')
  })
})

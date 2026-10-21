import { describe, expect, it } from 'vitest'
import { attachmentSlots, notesHtmlToMarkdown, type HtmlHooks } from './notesHtml.ts'

const hooks: HtmlHooks = {
  image: (mime) => `![](img.${mime.split('/')[1]})`,
  attachment: (i) => `![](att${i}.png)`,
}
const md = (html: string, h: HtmlHooks = hooks) => notesHtmlToMarkdown(html, h)

describe('notesHtmlToMarkdown', () => {
  it('converts a note as Apple Notes returns it', () => {
    // From a note made in Notes on macOS 27: the Title style, styles, a link, a list and an image.
    const html =
      '<div><b><font face=".AppleSystemUIFontBold"><span style="font-size: 24px">BT Notes import test</span></font></b></div>\n' +
      '<div>Plain line with <b>bold</b>, <i>italic</i> and a <u><a href="https://example.com/">link</a></u> #inbox</div>\n' +
      '<ul>\n<li>first</li>\n<li>second</li>\n</ul>\n<div><br><br></div>\n<div>Last line</div>\n'
    expect(md(html)).toBe(
      '# BT Notes import test\nPlain line with **bold**, *italic* and a [link](https://example.com/) #inbox\n- first\n- second\n\n![](att0.png)\nLast line',
    )
  })

  it('keeps blank lines and collapses runs of them', () => {
    expect(md('<div>a</div><div><br></div><div>b</div><div><br></div><div><br></div><div><br></div><div>c</div>')).toBe('a\n\nb\n\nc')
  })

  it('treats <div><br><br></div> as a blank line when there is no attachment for it', () => {
    expect(md('<div>a</div><div><br><br></div><div>b</div>', { ...hooks, attachment: () => null })).toBe('a\n\nb')
  })

  it('numbers attachment markers in order', () => {
    expect(md('<div><br><br></div><div>x</div><div><br><br></div>')).toBe('![](att0.png)\nx\n![](att1.png)')
  })

  it('passes embedded images to the hook', () => {
    const seen: string[] = []
    const out = md('<div><img style="max-width: 100%;" src="data:image/jpeg;base64,AAEC\nAw=="/></div>', {
      ...hooks,
      image: (mime, b64) => (seen.push(`${mime} ${b64}`), '![](x.jpg)'),
    })
    expect(out).toBe('![](x.jpg)')
    expect(seen).toEqual(['image/jpeg AAECAw=='])
  })

  it('converts headings, Heading-style lines and <h1>', () => {
    expect(md('<div><h1>Big</h1></div><div><b><span style="font-size: 18px">Section</span></b></div><div><span style="font-size: 24px">not bold</span></div>')).toBe(
      '# Big\n## Section\nnot bold',
    )
  })

  it('keeps spaces outside emphasis markers', () => {
    expect(md('<div>a<b> bold </b>b <i></i>c</div>')).toBe('a **bold** b c')
  })

  it('converts strikethrough and monospace', () => {
    expect(md('<div><strike>gone</strike> <tt>code</tt></div>')).toBe('~~gone~~ `code`')
  })

  it('shows a link whose text is its address as the bare address', () => {
    expect(md('<div><a href="https://example.com/">https://example.com</a></div>')).toBe('https://example.com/')
  })

  it('converts nested and numbered lists', () => {
    expect(md('<ol><li>one</li><li>two<ul><li>sub</li></ul></li></ol>')).toBe('1. one\n2. two\n  - sub')
    expect(md('<ul><li>a</li><ul><li>b</li></ul></ul>')).toBe('- a\n  - b')
  })

  it('ends lists and tables with a blank line, so the next line stays out of them', () => {
    expect(md('<div>a</div><ul><li>b</li></ul><div>c</div>')).toBe('a\n- b\n\nc')
    expect(md('<div>a</div><table><tr><td>b</td></tr></table><div>c</div>')).toBe('a\n\n| b |\n| --- |\n\nc')
    expect(md('<ul><li>a</li></ul><div><br></div><div>b</div>')).toBe('- a\n\nb')
  })

  it('converts tables, escaping pipes', () => {
    const html = '<div><object><table><tbody><tr><td>A</td><td>B</td></tr><tr><td>1|2</td><td><b>3</b></td></tr></tbody></table></object></div>'
    expect(md(html)).toBe('| A | B |\n| --- | --- |\n| 1\\|2 | **3** |')
  })

  it('decodes entities', () => {
    expect(md('<div>Tom &amp; Jerry&nbsp;&lt;3 &#128512; &#x2713;</div>')).toBe('Tom & Jerry <3 😀 ✓')
  })
})

describe('attachmentSlots', () => {
  it('counts attachment markers', () => {
    expect(attachmentSlots('<div>a</div>\n<div><br><br></div><div><br></div><div><br/><br/></div>')).toBe(2)
  })
})

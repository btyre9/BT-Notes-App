import { describe, expect, it } from 'vitest'
import { parseLinkPreview } from './linkPreview'

describe('parseLinkPreview', () => {
  it('reads Open Graph tags, decoding entities and resolving the image', () => {
    const html = `<html><head>
      <title>Fallback title</title>
      <meta property="og:title" content="Spring launch &amp; more">
      <meta property="og:description" content="Slow mornings, made to share.">
      <meta property="og:image" content="/images/hero.jpg">
      <meta property="og:site_name" content="Halden Roastery">
    </head><body></body></html>`
    expect(parseLinkPreview(html, 'https://example.com/blog/post')).toEqual({
      url: 'https://example.com/blog/post',
      title: 'Spring launch & more',
      description: 'Slow mornings, made to share.',
      image: 'https://example.com/images/hero.jpg',
      site: 'Halden Roastery',
    })
  })

  it('falls back to Twitter tags, the description tag and the title tag', () => {
    const html = `<head><title>
      Page   title
    </title><meta name="description" content='Plain description'><meta name="twitter:image" content="https://cdn.example.com/a.png"></head>`
    expect(parseLinkPreview(html, 'https://example.com')).toMatchObject({
      title: 'Page title',
      description: 'Plain description',
      image: 'https://cdn.example.com/a.png',
    })
  })

  it('takes the first value, ignores attribute order, and drops non-web images', () => {
    const html = `<meta content="First" property="og:title"><meta property="og:title" content="Second"><meta property="og:image" content="javascript:alert(1)">`
    const preview = parseLinkPreview(html, 'https://example.com')
    expect(preview.title).toBe('First')
    expect(preview.image).toBeUndefined()
  })

  it('shortens long descriptions at a word', () => {
    const long = 'word '.repeat(100)
    const preview = parseLinkPreview(`<meta property="og:description" content="${long}">`, 'https://example.com')
    expect(preview.description!.length).toBeLessThanOrEqual(301)
    expect(preview.description!.endsWith('word…')).toBe(true)
  })

  it('copes with a page that has nothing', () => {
    expect(parseLinkPreview('<html><body>hi</body></html>', 'https://example.com')).toEqual({ url: 'https://example.com' })
  })
})

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { officeInfo, pdfTitle, textInfo } from './docInfo'

const core = (title: string) =>
  strToU8(`<?xml version="1.0"?><cp:coreProperties xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${title}</dc:title></cp:coreProperties>`)

const wordXml = (...paragraphs: string[]) =>
  strToU8(`<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`).join('')}<w:p/></w:body></w:document>`)

describe('officeInfo', () => {
  it('reads a Word title from its properties, and its first paragraphs', () => {
    const docx = zipSync({ 'docProps/core.xml': core('Brake Service Bulletin'), 'word/document.xml': wordXml('Intro', 'Step one &amp; two') })
    expect(officeInfo(docx, '.docx')).toEqual({ title: 'Brake Service Bulletin', lines: ['Intro', 'Step one & two'] })
  })

  it('uses the first line as the title when the properties have none', () => {
    const docx = zipSync({ 'docProps/core.xml': core(''), 'word/document.xml': wordXml('Training outline', 'Module 1: Brakes') })
    expect(officeInfo(docx, '.docx')).toEqual({ title: 'Training outline', lines: ['Module 1: Brakes'] })
  })

  it('ignores titles apps fill in on their own', () => {
    const docx = zipSync({ 'docProps/core.xml': core('Microsoft Word - Document1'), 'word/document.xml': wordXml('Real title') })
    expect(officeInfo(docx, '.docx').title).toBe('Real title')
  })

  it('reads the first slide of a presentation', () => {
    const slide = strToU8('<p:sld><a:p><a:r><a:t>Q4 Review</a:t></a:r></a:p><a:p><a:r><a:t>Sales up 12%</a:t></a:r></a:p></p:sld>')
    expect(officeInfo(zipSync({ 'ppt/slides/slide1.xml': slide }), '.pptx')).toEqual({ title: 'Q4 Review', lines: ['Sales up 12%'] })
  })
})

describe('textInfo', () => {
  it('takes the first non-empty lines', () => {
    expect(textInfo(strToU8('﻿First\r\n\r\nSecond\n'))).toEqual({ lines: ['First', 'Second'] })
  })
})

describe('pdfTitle', () => {
  it('reads literal, hex and UTF-16 titles', () => {
    expect(pdfTitle(strToU8('<< /Title (Service Bulletin \\(2026\\)) /Author (x) >>'))).toBe('Service Bulletin (2026)')
    expect(pdfTitle(strToU8('<< /Title <53637265656E> >>'))).toBe('Screen')
    expect(pdfTitle(strToU8('<< /Title <FEFF00480069> >>'))).toBe('Hi')
  })

  it('prefers the XMP title, and has none when there is none', () => {
    expect(pdfTitle(strToU8('<dc:title><rdf:Alt><rdf:li xml:lang="x-default">From XMP</rdf:li></rdf:Alt></dc:title> /Title (Old)'))).toBe('From XMP')
    expect(pdfTitle(strToU8('%PDF-1.7 no title here'))).toBeUndefined()
  })
})

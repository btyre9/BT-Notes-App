import * as fs from 'node:fs/promises'
import { extname } from 'node:path'
import { strFromU8, unzipSync } from 'fflate'

/** What a document card shows: the document's title, if it has one, and its first lines. */
export interface DocInfo {
  title?: string
  lines: string[]
}

const MAX_LINES = 8
const MAX_LINE = 200
const OFFICE = new Set(['.docx', '.docm', '.xlsx', '.xlsm', '.pptx', '.pptm'])
const TEXT = new Set(['.txt', '.log', '.text'])
/** Office and text files are read whole; a PDF's title is near its start or end. */
const PDF_SLICE = 512 * 1024

const cache = new Map<string, DocInfo>()

/** A document's title and first lines, read once for each version of the file. */
export async function docInfo(abs: string): Promise<DocInfo> {
  const stat = await fs.stat(abs)
  const key = `${abs}|${stat.mtimeMs}|${stat.size}`
  const cached = cache.get(key)
  if (cached) return cached
  const ext = extname(abs).toLowerCase()
  let info: DocInfo = { lines: [] }
  try {
    if (OFFICE.has(ext)) info = officeInfo(new Uint8Array(await fs.readFile(abs)), ext)
    else if (TEXT.has(ext)) info = textInfo(await readSlice(abs, 0, 16 * 1024))
    else if (ext === '.pdf') {
      const head = await readSlice(abs, 0, PDF_SLICE)
      const tail = stat.size > PDF_SLICE ? await readSlice(abs, stat.size - PDF_SLICE, PDF_SLICE) : Buffer.alloc(0)
      info = { title: pdfTitle(Buffer.concat([head, tail])), lines: [] }
    }
  } catch {
    // A damaged or locked file: the card shows the file name instead.
  }
  cache.set(key, info)
  return info
}

async function readSlice(abs: string, position: number, length: number): Promise<Buffer> {
  const file = await fs.open(abs, 'r')
  try {
    const buffer = Buffer.alloc(length)
    const { bytesRead } = await file.read(buffer, 0, length, position)
    return buffer.subarray(0, bytesRead)
  } finally {
    await file.close()
  }
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENTITIES[e] ?? m),
  )
}

const clip = (s: string) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1)}…` : s)

/** Titles some apps fill in on their own, which say nothing about the document. */
function usefulTitle(title: string | undefined): string | undefined {
  const cleaned = title
    ?.replace(/^Microsoft (Word|PowerPoint|Excel) - /, '')
    .replace(/\.(docx?|pptx?|xlsx?|pdf)$/i, '')
    .trim()
  return cleaned && !/^(untitled|document\d*|presentation\d*|book\d*)$/i.test(cleaned) ? cleaned : undefined
}

/** The text of each paragraph in an Office XML part: `<w:p>` in Word, `<a:p>` in PowerPoint. */
function paragraphs(xml: string, tag: 'w' | 'a'): string[] {
  return xml
    .split(new RegExp(`<${tag}:p[ >]`))
    .slice(1)
    .map((p) =>
      decodeXml(
        [...p.matchAll(new RegExp(`<${tag}:t(?: [^>]*)?>([^<]*)</${tag}:t>|<${tag}:tab/>`, 'g'))]
          .map((m) => m[1] ?? ' ')
          .join(''),
      ).trim(),
    )
    .filter(Boolean)
}

/**
 * Word, Excel and PowerPoint files are zip archives of XML. The title comes from the document's
 * properties; a Word document or presentation without one uses its first line.
 */
export function officeInfo(bytes: Uint8Array, ext: string): DocInfo {
  const wanted = new Set(['docProps/core.xml', 'word/document.xml', 'ppt/slides/slide1.xml'])
  const files = unzipSync(bytes, { filter: (f) => wanted.has(f.name) })
  const core = files['docProps/core.xml'] ? strFromU8(files['docProps/core.xml']) : ''
  let title = usefulTitle(decodeXml(/<dc:title>([^<]*)<\/dc:title>/.exec(core)?.[1] ?? ''))
  const part = ext.startsWith('.doc') ? files['word/document.xml'] : ext.startsWith('.ppt') ? files['ppt/slides/slide1.xml'] : undefined
  let lines = part ? paragraphs(strFromU8(part), ext.startsWith('.doc') ? 'w' : 'a') : []
  // Without a saved title, a short first line is usually the document's title.
  if (!title && lines[0] && lines[0].length <= 120) [title, ...lines] = lines
  return { title, lines: lines.slice(0, MAX_LINES).map(clip) }
}

/** A text file's first lines; its title is its file name. */
export function textInfo(bytes: Uint8Array): DocInfo {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes).replace(/^﻿/, '')
  return {
    lines: text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_LINES)
      .map(clip),
  }
}

/** Reads a PDF string: `(literal)` with escapes, or `<hex>`, in PDFDocEncoding or UTF-16. */
function pdfString(raw: string, hex: boolean): string {
  let bytes: number[]
  if (hex) {
    const digits = raw.replace(/\s+/g, '')
    bytes = (digits.length % 2 ? `${digits}0` : digits).match(/../g)?.map((h) => parseInt(h, 16)) ?? []
  } else {
    bytes = []
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i]
      if (c !== '\\') {
        bytes.push(raw.charCodeAt(i) & 0xff)
        continue
      }
      const next = raw[++i]
      const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12, '(': 40, ')': 41, '\\': 92 }
      if (next in escapes) bytes.push(escapes[next])
      else if (/[0-7]/.test(next)) {
        const octal = /^[0-7]{1,3}/.exec(raw.slice(i))![0]
        bytes.push(parseInt(octal, 8) & 0xff)
        i += octal.length - 1
      }
    }
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(new Uint8Array(bytes.slice(2)))
  }
  return String.fromCharCode(...bytes)
}

/**
 * A PDF's title, from its document information or its XMP metadata, where those aren't inside
 * compressed streams. Many PDFs have no useful title; their cards show the file name.
 */
export function pdfTitle(bytes: Uint8Array): string | undefined {
  const text = Buffer.from(bytes).toString('latin1')
  const xmp = /<dc:title>[\s\S]*?<rdf:li[^>]*>([^<]*)<\/rdf:li>/.exec(text)?.[1]
  if (xmp) {
    const title = usefulTitle(decodeXml(Buffer.from(xmp, 'latin1').toString('utf8')))
    if (title) return title
  }
  const literal = /\/Title\s*\(((?:\\.|[^\\)])*)\)/.exec(text)
  if (literal) return usefulTitle(pdfString(literal[1], false))
  const hex = /\/Title\s*<([0-9a-fA-F\s]*)>/.exec(text)
  if (hex) return usefulTitle(pdfString(hex[1], true))
  return undefined
}

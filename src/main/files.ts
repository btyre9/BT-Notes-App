import { createHash } from 'node:crypto'
import { createReadStream, existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { extname, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { app, nativeImage, net, protocol } from 'electron'

/**
 * Files in the notes folder reach the window through `btfile:` URLs:
 *   btfile://file/Attachments/kitchen.jpg          the file itself
 *   btfile://thumb/Attachments/kitchen.jpg?w=256   a preview at most 256 px wide
 *   btfile://pdfjs/wasm/openjpeg.wasm              data files pdf.js needs for scans and fonts
 *   btfile://web/?u=https%3A%2F%2F…                a link card's preview image from the web
 * Previews come from the operating system's thumbnailer and are cached outside the synced folder.
 * Web images are downloaded once and cached there too, so the window never loads anything from
 * the web itself.
 */
export const SCHEME = 'btfile'
const THUMB_SIZES = [256, 800]
/** Shown as they are, keeping transparency and animation; they're usually small. */
const SHOWN_AS_IS = /\.(gif|webp|svg|avif)$/i

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
}

/**
 * A file from disk, or the byte range the request asks for. Videos need ranges to seek, and the
 * PDF viewer needs the content type.
 */
async function serveFile(abs: string, request: Request): Promise<Response> {
  const { size } = await fs.stat(abs)
  const headers: Record<string, string> = {
    'Content-Type': TYPES[extname(abs).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    // pdf.js fetches its data files from a worker, which counts as another origin.
    'Access-Control-Allow-Origin': '*',
  }
  const body = (start: number, end: number) => Readable.toWeb(createReadStream(abs, { start, end })) as ReadableStream
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '')
  if (range && (range[1] || range[2])) {
    // `bytes=500-`, `bytes=500-999`, or `bytes=-500` for the last 500 bytes.
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
    if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    return new Response(body(start, end), {
      status: 206,
      headers: { ...headers, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
    })
  }
  return new Response(size ? body(0, size - 1) : null, { headers: { ...headers, 'Content-Length': String(size) } })
}

/** Must run before the app is ready. */
export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } },
  ])
}

const thumbDir = () => join(app.getPath('userData'), 'Previews')
/** PDF previews are drawn by the window (the OS can't on Windows) at this one width. */
const PDF_PREVIEW_WIDTH = 800
const isPdf = (abs: string) => /\.pdf$/i.test(abs)
const isImage = (abs: string) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i.test(abs)

/** Identifies one version of a file; previews are cached per version. */
export async function fileVersion(abs: string): Promise<string> {
  const stat = await fs.stat(abs)
  return `${stat.mtimeMs}|${stat.size}`
}

/** Where the preview of a file at a width is cached. It changes whenever the file does. */
async function previewPath(abs: string, width: number, version?: string): Promise<string> {
  const key = createHash('sha1')
    .update(`${abs}|${version ?? (await fileVersion(abs))}|${width}`)
    .digest('hex')
  return join(thumbDir(), `${key}${/\.png$/i.test(abs) ? '.png' : '.jpg'}`)
}

/**
 * Stores a PDF's first-page preview, drawn by the window from the version of the file it read,
 * so a file that changed while it was drawn doesn't get the old page.
 */
export async function savePdfPreview(abs: string, version: string, data: Uint8Array): Promise<void> {
  if (!isPdf(abs)) throw new Error('Only PDF previews can be saved')
  await fs.mkdir(thumbDir(), { recursive: true })
  await fs.writeFile(await previewPath(abs, PDF_PREVIEW_WIDTH, version), data)
}

/** pdf.js's data files: shipped beside the app when packaged, from node_modules otherwise. */
const pdfjsDir = () => (app.isPackaged ? join(process.resourcesPath, 'pdfjs') : join(app.getAppPath(), 'node_modules', 'pdfjs-dist'))
const PDFJS_FOLDERS = ['wasm', 'cmaps', 'standard_fonts', 'iccs']
/** Previews being made, so two requests for the same one share the work. */
const pending = new Map<string, Promise<string | null>>()
/** Previews not worth making, because the file is already small enough. */
const notNeeded = new Set<string>()

/** Image data for a preview, or null to show the file itself. */
async function makePreview(abs: string, width: number): Promise<Buffer | null> {
  if (SHOWN_AS_IS.test(abs)) return null
  // Windows' thumbnailer turns transparency black, so PNGs are scaled here instead.
  if (/\.png$/i.test(abs)) {
    const image = nativeImage.createFromPath(abs)
    if (image.isEmpty() || image.getSize().width <= width) return null
    return image.resize({ width, quality: 'good' }).toPNG()
  }
  const image = await nativeImage.createThumbnailFromPath(abs, { width, height: width * 4 })
  return image.isEmpty() ? null : image.toJPEG(85)
}

async function thumbnail(abs: string, width: number): Promise<string | null> {
  const out = await previewPath(abs, width)
  if (notNeeded.has(out)) return null
  if (existsSync(out)) return out
  let job = pending.get(out)
  if (!job) {
    job = (async () => {
      try {
        const data = await makePreview(abs, width)
        if (!data) {
          notNeeded.add(out)
          return null
        }
        await fs.mkdir(thumbDir(), { recursive: true })
        await fs.writeFile(out, data)
        return out
      } catch {
        // No thumbnailer for this file type, or this platform has none: the caller serves the file.
        return null
      } finally {
        pending.delete(out)
      }
    })()
    pending.set(out, job)
  }
  return job
}

/** Serves `btfile:` URLs from the notes folder that `resolve` maps relative paths into. */
const webImageDir = () => join(app.getPath('userData'), 'Web images')
const MAX_WEB_IMAGE = 10 * 1024 * 1024
const WEB_IMAGE_TYPES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp', 'image/avif': '.avif' }

/** An image's extension from its first bytes, or null if it isn't one the window can show. */
function imageExt(data: Buffer): string | null {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return '.jpg'
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return '.png'
  if (data.subarray(0, 4).toString('latin1') === 'GIF8') return '.gif'
  if (data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return '.webp'
  if (data.subarray(4, 8).toString('latin1') === 'ftyp' && /^avi[fs]$/.test(data.subarray(8, 12).toString('latin1'))) return '.avif'
  return null
}

/** A link card's preview image: from the cache, or downloaded into it the first time. */
async function webImage(address: string | null): Promise<Response> {
  if (!address || !/^https?:\/\//i.test(address)) return new Response('Not found', { status: 404 })
  const key = createHash('sha1').update(address).digest('hex')
  await fs.mkdir(webImageDir(), { recursive: true })
  const cached = (await fs.readdir(webImageDir())).find((name) => name.startsWith(key))
  if (cached) return net.fetch(pathToFileURL(join(webImageDir(), cached)).toString())
  const response = await fetch(address, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    // Image servers often refuse requests that don't look like they come from a browser.
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) BTNotes/1.0 Safari/537.36',
      Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8',
    },
  })
  if (!response.ok) return new Response('Not found', { status: 404 })
  const data = Buffer.from(await response.arrayBuffer())
  if (data.length > MAX_WEB_IMAGE) return new Response('Too large', { status: 404 })
  // Some servers label every file as a generic download, so the first bytes have the last word.
  const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const ext = imageExt(data) ?? WEB_IMAGE_TYPES[type]
  if (!ext) return new Response('Not an image', { status: 404 })
  const file = join(webImageDir(), `${key}${ext}`)
  await fs.writeFile(file, data)
  return net.fetch(pathToFileURL(file).toString())
}

export function handleScheme(resolveInVault: (rel: string) => string | null): void {
  protocol.handle(SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname === 'web') return await webImage(url.searchParams.get('u'))
      const rel = decodeURIComponent(url.pathname.slice(1))
      if (url.hostname === 'pdfjs') {
        const base = resolve(pdfjsDir())
        const abs = resolve(base, rel)
        const allowed = PDFJS_FOLDERS.some((folder) => abs.startsWith(join(base, folder) + sep))
        return allowed && existsSync(abs) ? serveFile(abs, request) : new Response('Not found', { status: 404 })
      }
      const abs = resolveInVault(rel)
      if (!abs || !existsSync(abs)) return new Response('Not found', { status: 404 })
      if (url.hostname === 'thumb' && isPdf(abs)) {
        // Not made yet: the window draws it and saves it, then asks again.
        const preview = await previewPath(abs, PDF_PREVIEW_WIDTH)
        return existsSync(preview) ? net.fetch(pathToFileURL(preview).toString()) : new Response('Not made yet', { status: 404 })
      }
      if (url.hostname === 'thumb') {
        const asked = Number(url.searchParams.get('w')) || THUMB_SIZES[0]
        const width = THUMB_SIZES.find((size) => size >= asked) ?? THUMB_SIZES.at(-1)!
        const thumb = await thumbnail(abs, width)
        if (thumb) return net.fetch(pathToFileURL(thumb).toString())
        // An image can stand in for its own preview; a video or document can't.
        if (!isImage(abs)) return new Response('No preview', { status: 404 })
      }
      return serveFile(abs, request)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}

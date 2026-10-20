import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Matches the width the main process stores PDF previews at. */
const PREVIEW_WIDTH = 800
/** pdf.js's decoders for scanned pages, its fonts and color profiles, served by the main process. */
const DATA = 'btfile://pdfjs/'

const running = new Map<string, Promise<void>>()
/** Previews are drawn one at a time, sharing one worker, so a board full of PDFs can't swamp the window. */
let queue: Promise<unknown> = Promise.resolve()
let worker: pdfjs.PDFWorker | null = null

/**
 * Draws the first page of a PDF in the notes folder and stores it as the file's preview. Windows
 * can't make PDF previews itself, so this runs the first time a PDF card is shown on a device.
 */
export function makePdfPreview(path: string): Promise<void> {
  let job = running.get(path)
  if (!job) {
    job = queue.then(() => draw(path)).finally(() => running.delete(path))
    queue = job.catch(() => {})
    running.set(path, job)
  }
  return job
}

async function draw(path: string): Promise<void> {
  const { data, version } = await window.bt.vault.readFile(path)
  worker ??= new pdfjs.PDFWorker()
  const loading = pdfjs.getDocument({
    data,
    worker,
    wasmUrl: `${DATA}wasm/`,
    cMapUrl: `${DATA}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${DATA}standard_fonts/`,
    iccUrl: `${DATA}iccs/`,
  })
  try {
    const doc = await loading.promise
    const page = await doc.getPage(1)
    const viewport = page.getViewport({ scale: PREVIEW_WIDTH / page.getViewport({ scale: 1 }).width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    await page.render({ canvas, viewport }).promise
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) throw new Error(`Couldn't draw ${path}`)
    await window.bt.vault.savePdfPreview(path, version, new Uint8Array(await blob.arrayBuffer()))
  } finally {
    await loading.destroy()
  }
}

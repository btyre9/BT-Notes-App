import * as fs from 'node:fs/promises'

/**
 * An image's width and height, read from the start of the file: PNG, JPEG, GIF and WebP. Other
 * formats, or files it can't read, count as 4:3.
 */
export async function imageSize(path: string): Promise<{ width: number; height: number }> {
  const fallback = { width: 4, height: 3 }
  let file: fs.FileHandle | undefined
  try {
    file = await fs.open(path, 'r')
    // Phone photos can carry large EXIF blocks before the part that holds the size.
    const head = Buffer.alloc(1024 * 1024)
    const { bytesRead } = await file.read(head, 0, head.length, 0)
    const b = head.subarray(0, bytesRead)
    const size = png(b) ?? gif(b) ?? webp(b) ?? jpeg(b)
    return size && size.width > 0 && size.height > 0 ? size : fallback
  } catch {
    return fallback
  } finally {
    await file?.close()
  }
}

type Size = { width: number; height: number } | null

function png(b: Buffer): Size {
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) }
}

function gif(b: Buffer): Size {
  if (b.length < 10 || b.toString('ascii', 0, 3) !== 'GIF') return null
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) }
}

function webp(b: Buffer): Size {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null
  const chunk = b.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }
  if (chunk === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }
  if (chunk === 'VP8L') {
    const bits = b.readUInt32LE(21)
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }
  }
  return null
}

/**
 * Walks JPEG markers to the frame header, which holds the size. Phone photos are often stored
 * sideways with an EXIF orientation that says to turn them, as the app does when it shows them.
 */
function jpeg(b: Buffer): Size {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null
  let i = 2
  let turned = false
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]
    const length = b.readUInt16BE(i + 2)
    if (marker === 0xe1 && b.toString('ascii', i + 4, i + 8) === 'Exif') turned = exifTurned(b, i + 10)
    // Start-of-frame markers, except the ones that aren't (DHT, JPG, DAC).
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      const height = b.readUInt16BE(i + 5)
      const width = b.readUInt16BE(i + 7)
      return turned ? { width: height, height: width } : { width, height }
    }
    i += 2 + length
  }
  return null
}

/** True if the EXIF block starting at `tiff` says the image is turned a quarter (orientations 5–8). */
function exifTurned(b: Buffer, tiff: number): boolean {
  try {
    const little = b.toString('ascii', tiff, tiff + 2) === 'II'
    const u16 = (at: number) => (little ? b.readUInt16LE(at) : b.readUInt16BE(at))
    const u32 = (at: number) => (little ? b.readUInt32LE(at) : b.readUInt32BE(at))
    const ifd = tiff + u32(tiff + 4)
    for (let entry = 0; entry < u16(ifd); entry++) {
      const at = ifd + 2 + entry * 12
      if (u16(at) === 0x0112) return u16(at + 8) >= 5
    }
  } catch {
    // A malformed EXIF block: take the size as stored.
  }
  return false
}

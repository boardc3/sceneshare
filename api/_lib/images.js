import sharp from 'sharp'

// Gemini image models accept these output ratios; pick the nearest to the source
// so the final resize to the source's exact shape crops almost nothing.
const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']

export function nearestRatio(w, h) {
  const target = Math.log(w / h)
  let best = RATIOS[0]
  let bestD = Infinity
  for (const r of RATIOS) {
    const [a, b] = r.split(':').map(Number)
    const d = Math.abs(Math.log(a / b) - target)
    if (d < bestD) {
      bestD = d
      best = r
    }
  }
  return best
}

// Normalise any input photo: honour EXIF orientation, cap the long edge, re-encode
// as JPEG. Returns the bytes plus their true pixel size (aspect ratio is law — the
// size is always read from the bytes, never typed).
export async function normalize(buffer, maxEdge = 2048) {
  const img = sharp(buffer, { failOn: 'none' }).rotate()
  const meta = await img.metadata()
  let w = meta.autoOrient?.width || meta.width
  let h = meta.autoOrient?.height || meta.height
  if (!w || !h) throw new Error('not an image')
  const scale = Math.min(1, maxEdge / Math.max(w, h))
  const out = await img
    .resize({ width: Math.round(w * scale), height: Math.round(h * scale), fit: 'fill' })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { buffer: out.data, width: out.info.width, height: out.info.height }
}

// The size a render is delivered at: exactly the source's aspect ratio, long edge
// between 1600 and 2048 px so small sources (Street View is 640 px) still come
// back sharp.
export function outputSize(w, h) {
  const long = Math.max(w, h)
  const targetLong = Math.min(2048, Math.max(1600, long))
  const s = targetLong / long
  return { width: Math.round(w * s), height: Math.round(h * s) }
}

export async function fitTo(buffer, width, height) {
  const out = await sharp(buffer, { failOn: 'none' })
    .resize({ width, height, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })
  return { buffer: out.data, width: out.info.width, height: out.info.height }
}

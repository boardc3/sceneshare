import sharp from 'sharp'

// Automatic overlay check (playbook Template G, step 3: "overlay-verify before
// anything else is spent on the take"). Structure — walls, openings, ceiling and
// floor lines — shows up as strong edges that survive a restyle; furniture and
// finishes change. So: edge maps of source and render at low resolution, slightly
// blurred so a 1–2 px shift is forgiven, then normalised cross-correlation.
// A render whose camera drifted (zoomed out, re-centred, moved walls) scores low.
const W = 192

async function edgeMap(buffer, width, height) {
  const h = Math.round((W * height) / width)
  const { data } = await sharp(buffer, { failOn: 'none' })
    .resize({ width: W, height: h, fit: 'fill' })
    .greyscale()
    .convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] })
    .blur(1.2)
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { data, h }
}

export async function alignmentScore(srcBuf, srcW, srcH, outBuf) {
  const a = await edgeMap(srcBuf, srcW, srcH)
  const b = await edgeMap(outBuf, srcW, srcH)
  const n = Math.min(a.data.length, b.data.length)
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) {
    ma += a.data[i]
    mb += b.data[i]
  }
  ma /= n
  mb /= n
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < n; i++) {
    const x = a.data[i] - ma
    const y = b.data[i] - mb
    num += x * y
    da += x * x
    db += y * y
  }
  return da && db ? num / Math.sqrt(da * db) : 0
}

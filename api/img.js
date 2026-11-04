import { isAllowedImageUrl, downloadImage } from './_lib/storage.js'
import { fail, query } from './_lib/http.js'

// Image passthrough for listing photos when Blob storage is not configured.
// Allowed hosts only (see storage.js) so this is not an open proxy.
export default async function handler(req, res) {
  const { u } = query(req)
  if (!u || !isAllowedImageUrl(u)) return fail(res, 400, 'image_not_allowed', 'Image host not allowed.')
  try {
    const buf = await downloadImage(u)
    const type = buf[0] === 0x89 ? 'image/png' : buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/jpeg'
    res.statusCode = 200
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800')
    res.end(buf)
  } catch {
    fail(res, 502, 'image_unavailable', 'That photo could not be loaded.')
  }
}

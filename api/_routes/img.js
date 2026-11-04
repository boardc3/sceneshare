import { isAllowedImageUrl, downloadImage } from '../_lib/storage.js'
import { ApiError, query, route } from '../_lib/http.js'

// Image passthrough for listing photos when Blob storage is not configured.
// Allowed hosts only (see storage.js) so this is not an open proxy.
export default route(
  ['GET'],
  async (req, res) => {
    const { u } = query(req)
    if (!u || !isAllowedImageUrl(u)) throw new ApiError(400, 'image_not_allowed', 'Image host not allowed.')
    let buf
    try {
      buf = await downloadImage(u)
    } catch {
      throw new ApiError(502, 'image_unavailable', 'That photo could not be loaded.')
    }
    const type = buf[0] === 0x89 ? 'image/png' : buf.slice(8, 12).toString() === 'WEBP' ? 'image/webp' : 'image/jpeg'
    res.statusCode = 200
    res.setHeader('Content-Type', type)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=604800')
    res.end(buf)
  },
  { name: 'img' },
)

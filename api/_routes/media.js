import { getImage } from '../_lib/db.js'
import { ApiError, query, route } from '../_lib/http.js'
import { watermark } from '../_lib/watermark.js'

// Images kept in Neon (when Vercel Blob is not set up). Ids are random and the
// bytes never change, so browsers and Vercel's CDN may cache them for good.
export default route(
  ['GET'],
  async (req, res) => {
    const { id } = query(req)
    if (!/^[a-z0-9]{16}$/.test(id || '')) throw new ApiError(400, 'bad_id', 'Unknown image.')
    const img = await getImage(id)
    if (!img) throw new ApiError(404, 'not_found', 'Image not found.')
    // AI renders go out with the "AI Generated Image" mark; photos as they are.
    const ai = /^render/.test(img.kind)
    const body = ai ? await watermark(img.buffer) : img.buffer
    res.statusCode = 200
    res.setHeader('Content-Type', ai && body !== img.buffer ? 'image/jpeg' : img.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable')
    res.setHeader('X-Robots-Tag', 'noindex')
    res.end(body)
  },
  { name: 'media' },
)

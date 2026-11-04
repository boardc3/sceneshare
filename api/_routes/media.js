import { getImage } from '../_lib/db.js'
import { ApiError, query, route } from '../_lib/http.js'

// Images kept in Neon (when Vercel Blob is not set up). Ids are random and the
// bytes never change, so browsers and Vercel's CDN may cache them for good.
export default route(
  ['GET'],
  async (req, res) => {
    const { id } = query(req)
    if (!/^[a-z0-9]{16}$/.test(id || '')) throw new ApiError(400, 'bad_id', 'Unknown image.')
    const img = await getImage(id)
    if (!img) throw new ApiError(404, 'not_found', 'Image not found.')
    res.statusCode = 200
    res.setHeader('Content-Type', img.contentType)
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, immutable')
    res.setHeader('X-Robots-Tag', 'noindex')
    res.end(img.buffer)
  },
  { name: 'media' },
)

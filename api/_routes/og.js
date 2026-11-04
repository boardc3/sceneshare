import sharp from 'sharp'
import { normalizeProperty, versionFor, visiblePhotos } from '../../shared/model.js'
import { propertyRow } from '../_lib/db.js'
import { validId } from '../_lib/gate.js'
import { ApiError, query, route } from '../_lib/http.js'
import { loadImageInput } from '../_lib/source.js'

// The link-preview image for a shared home (1200 × 630): its first photo split down
// the middle — as photographed on the left, the featured design on the right — the
// way the compare slider looks on the page. Cached hard; the URL changes with the home.
const W = 1200
const H = 630

export default route(
  ['GET'],
  async (req, res) => {
    const { id } = query(req)
    if (!validId(id)) throw new ApiError(400, 'bad_id', 'Unknown home.')
    const row = await propertyRow(id)
    if (!row) throw new ApiError(404, 'not_found', 'This home is no longer shared.')
    const p = normalizeProperty(row.data)
    const photos = visiblePhotos(p)
    if (!photos.length) throw new ApiError(404, 'no_photos', 'This home has no photos yet.')
    // Prefer a photo the featured design restyled.
    const featured = p.designs.find((d) => d.id === p.featured)
    const photo = (featured && photos.find((ph) => featured.picks[ph.id])) || photos[0]
    const after = featured ? versionFor(p, featured.id, photo.id) : null

    const fit = async (src) => sharp(await loadImageInput(src)).rotate().resize(W, H, { fit: 'cover', position: 'centre' }).toBuffer()
    const base = await fit(photo.src)
    let out
    if (after) {
      const right = await fit(after.src)
      const leftHalf = await sharp(base).extract({ left: 0, top: 0, width: W / 2, height: H }).toBuffer()
      const handle = Buffer.from(
        `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
          <rect x="${W / 2 - 2}" y="0" width="4" height="${H}" fill="#f8f9f7"/>
          <circle cx="${W / 2}" cy="${H / 2}" r="26" fill="#e8a548" stroke="#16212b" stroke-width="3"/>
          <path d="M${W / 2 - 9} ${H / 2 - 8} l-8 8 l8 8 M${W / 2 + 9} ${H / 2 - 8} l8 8 l-8 8" fill="none" stroke="#16212b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`,
      )
      out = await sharp(right).composite([{ input: leftHalf, left: 0, top: 0 }, { input: handle, left: 0, top: 0 }]).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    } else {
      out = await sharp(base).jpeg({ quality: 82, mozjpeg: true }).toBuffer()
    }
    res.statusCode = 200
    res.setHeader('Content-Type', 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=2592000, stale-while-revalidate=86400')
    res.setHeader('X-Robots-Tag', 'noindex')
    res.end(out)
  },
  { name: 'og' },
)

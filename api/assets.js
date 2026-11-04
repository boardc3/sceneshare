import img from './_routes/img.js'
import media from './_routes/media.js'
import og from './_routes/og.js'
import page from './_routes/page.js'
import { fail } from './_lib/http.js'

// Images and the share-link page: /api/media, /api/img, /api/og and /p/<id>,
// rewritten here by vercel.json as /api/assets?fn=<name>.
const ROUTES = { img, media, og, page }

export const maxDuration = 60

export default function handler(req, res) {
  const fn = new URL(req.url, 'http://local').searchParams.get('fn') || ''
  const h = ROUTES[fn]
  if (!h) return fail(res, 404, 'not_found', 'Unknown endpoint.')
  return h(req, res)
}

import { autocomplete } from './_lib/mapbox.js'
import { query, route, send } from './_lib/http.js'

export default route(['GET'], async (req, res) => {
  const { q = '', lang = 'en' } = query(req)
  if (q.trim().length < 3) return send(res, 200, { ok: true, suggestions: [] })
  const suggestions = await autocomplete(q.trim().slice(0, 200), lang)
  send(res, 200, { ok: true, suggestions })
})

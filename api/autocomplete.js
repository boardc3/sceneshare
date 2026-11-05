import { autocomplete, geocode, unitFrom, unitsNear } from './_lib/mapbox.js'
import { query, route, send } from './_lib/http.js'
import { unitsAt } from './_lib/zillow.js'

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })

// Address suggestions while typing (a lookup, not a search: no account needed).
// ?units=1&q=<address>  → the apartments / units known at that building, so a
// multi-unit building gets a unit picker.
export default route(
  ['GET'],
  async (req, res) => {
    const { q = '', lang = 'en', units } = query(req)
    if (q.trim().length < 3) return send(res, 200, { ok: true, suggestions: [], units: [] })
    if (units === '1') {
      const addr = await geocode({ address: q.trim().slice(0, 200), lang }).catch(() => null)
      if (!addr?.streetNumber) return send(res, 200, { ok: true, units: [] })
      const [z, m] = await Promise.all([unitsAt(addr), unitsNear(`${addr.streetNumber} ${addr.route}, ${addr.city}, ${addr.state} ${addr.zip}`, lang)])
      const list = [...new Set([...z, ...m])].sort(natural).slice(0, 300)
      res._meta = { units: list.length }
      return send(res, 200, { ok: true, units: list, unit: unitFrom(q) || addr.unit || null }, { 'Cache-Control': 'private, max-age=600' })
    }
    const suggestions = await autocomplete(q.trim().slice(0, 200), lang)
    send(res, 200, { ok: true, suggestions })
  },
  { name: 'autocomplete', limit: { hour: 600, day: 3000 } },
)

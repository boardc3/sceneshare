import { createOwnProperty, logSubmission, upsertProperty } from './_lib/db.js'
import { newId, requireOwner, requireUser, validId } from './_lib/gate.js'
import { geocode, nearby } from './_lib/mapbox.js'
import { ApiError, readJson, route, send } from './_lib/http.js'
import { parcelFor } from './_lib/parcel.js'

// Fast half of an address lookup: where it is (Mapbox), the parcel (county
// assessor) and what is nearby (Mapbox). Listing photos (slow, scraped) come from
// /api/listing right after. The home is saved to the signed-in account.
// { own: true } instead starts an empty home for the "use my own photos" flow.
export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const user = req._user
    const lang = body.lang === 'zh' ? 'zh' : 'en'

    if (body.own) {
      const id = newId()
      await createOwnProperty(id, { user, lang })
      await logSubmission({ user, kind: 'own_start', propertyId: id, lang })
      return send(res, 200, { ok: true, id })
    }

    const address = String(body.address || '').trim().slice(0, 300)
    if (!address) throw new ApiError(400, 'address_required', 'Enter a street address.')
    // Adding an address to an own-photos home: only its owner may.
    const existing = validId(body.propertyId) ? body.propertyId : null
    if (existing) await requireOwner(req, res, existing)

    const addr = await geocode({ address, lang })
    if (!addr) throw new ApiError(404, 'address_not_found', 'We could not find that address. Check the spelling and include the city and state.')
    if (!addr.streetNumber) {
      throw new ApiError(422, 'not_a_street_address', 'That looks like an area, not a single home. Enter a full street address with a house number.')
    }

    const id = existing || newId()
    const [parcel, pois] = await Promise.all([parcelFor(addr), nearby(addr.lat, addr.lng, lang)])
    const property = { id, createdAt: new Date().toISOString(), address: addr, parcel, pois, photos: [], facts: null, listing: null, designs: [] }
    const saved = await upsertProperty(property, { user, origin: existing ? 'own' : 'address', lang })
    if (!saved.ok) throw new ApiError(403, 'not_owner', 'Only the account that saved this home can change it.')
    await logSubmission({ user, kind: 'address_search', address: addr.formatted, propertyId: id, lang, meta: { county: addr.county, parcel: Boolean(parcel), pois: pois.length } })
    res._meta = { propertyId: id }
    send(res, 200, { ok: true, property })
  },
  { name: 'property', before: requireUser, limit: { hour: 60, day: 300 } },
)

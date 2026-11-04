import { logSubmission } from './_lib/db.js'
import { newId, requireEmail } from './_lib/gate.js'
import { geocode, nearby } from './_lib/mapbox.js'
import { ApiError, readJson, route, send } from './_lib/http.js'
import { parcelFor } from './_lib/parcel.js'

// Fast half of an address lookup: where it is (Mapbox), the parcel (county
// assessor) and what is nearby (Mapbox). Listing photos (slow, scraped) come from
// /api/listing right after.
export default route(['POST'], async (req, res) => {
  const body = await readJson(req)
  const email = requireEmail(body)
  const lang = body.lang === 'zh' ? 'zh' : 'en'
  const address = String(body.address || '').trim().slice(0, 300)
  if (!address) throw new ApiError(400, 'address_required', 'Enter a street address.')

  const addr = await geocode({ address, lang })
  if (!addr) throw new ApiError(404, 'address_not_found', 'We could not find that address. Check the spelling and include the city and state.')
  if (!addr.streetNumber) {
    throw new ApiError(422, 'not_a_street_address', 'That looks like an area, not a single home. Enter a full street address with a house number.')
  }

  // The own-photos flow creates its id in the browser and adds the address later.
  const id = /^[a-z0-9]{6,20}$/.test(body.propertyId || '') ? body.propertyId : newId()
  await logSubmission({ email, kind: 'address_search', address: addr.formatted, propertyId: id, lang })

  const [parcel, pois] = await Promise.all([parcelFor(addr), nearby(addr.lat, addr.lng, lang)])
  const photos = []

  send(res, 200, {
    ok: true,
    property: {
      id,
      createdAt: new Date().toISOString(),
      address: addr,
      parcel,
      pois,
      photos,
      facts: null,
      listing: null,
    },
  })
})

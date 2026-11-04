import { config } from './_lib/config.js'
import { insertPhotoRows, logSubmission, mutateProperty, setPropertyColumns } from './_lib/db.js'
import { newId, requireOwner, requireUser } from './_lib/gate.js'
import { readJson, route, send } from './_lib/http.js'
import { normalize } from './_lib/images.js'
import { fetchRedfin, findRedfinUrl } from './_lib/redfin.js'
import { canStoreImages, downloadImage, storeImage } from './_lib/storage.js'
import { fetchZillow, findZpid } from './_lib/zillow.js'

export const maxDuration = 300

// Slow half of an address lookup: the home's own listing photos and facts from
// Zillow and Redfin, fetched through ScraperAPI and copied into our own storage
// ("pull the images locally"). Every photo keeps its source for the credit line.
export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const { user, row } = await requireOwner(req, res, body.propertyId)
    const propertyId = row.id
    const addr = row.data?.address || {}
    const done = async (payload) => {
      await mutateProperty(propertyId, (p) => (p.listingChecked ? false : { ...p, listingChecked: true }))
      send(res, 200, { ok: true, ...payload })
    }
    if (!addr.streetNumber || !addr.zip) return done({ found: false, reason: 'incomplete_address', photos: [] })
    if (!config.scraperKey) return done({ found: false, reason: 'scraper_not_configured', photos: [] })

    const deadline = Date.now() + 200000
    const [z, r] = await Promise.all([
      (async () => {
        const hit = await findZpid(addr)
        if (!hit) return { source: 'zillow', ok: false, reason: 'not_on_zillow', photos: [] }
        return { source: 'zillow', ...(await fetchZillow(hit.zpid, { deadline })) }
      })().catch((e) => ({ source: 'zillow', ok: false, reason: e.message, photos: [] })),
      (async () => {
        const url = await findRedfinUrl(addr)
        if (!url) return { source: 'redfin', ok: false, reason: 'not_on_redfin', photos: [] }
        return { source: 'redfin', ...(await fetchRedfin(url, { deadline })) }
      })().catch((e) => ({ source: 'redfin', ok: false, reason: e.message, photos: [] })),
    ])

    // One source, not both: the two sites usually carry the same MLS photos, and a
    // gallery of duplicates is worse than either. Most photos wins; Zillow on a tie.
    const pick = [z, r].filter((x) => x.photos?.length).sort((a, b) => b.photos.length - a.photos.length)[0] || null
    const facts = z.facts || null
    const sourceName = pick?.source === 'redfin' ? 'Redfin' : 'Zillow'

    let photos = []
    if (pick) {
      const list = pick.photos.slice(0, config.maxListingPhotos)
      const referer = pick.source === 'redfin' ? 'https://www.redfin.com/' : 'https://www.zillow.com/'
      const out = new Array(list.length).fill(null)
      let next = 0
      const worker = async () => {
        while (next < list.length && Date.now() < deadline + 60000) {
          const i = next++
          const p = list[i]
          try {
            if (canStoreImages()) {
              // 1600 px is plenty for the studio and the buyer page, and keeps a home's
              // listing set to a few MB when images live in Neon.
              const n = await normalize(await downloadImage(p.url, { referer }), 1600)
              const url = await storeImage(n.buffer, { propertyId, kind: `listing-${String(i + 1).padStart(2, '0')}` })
              out[i] = { src: url, width: n.width, height: n.height }
            } else {
              out[i] = { src: `/api/img?u=${encodeURIComponent(p.url)}`, width: null, height: null }
            }
          } catch (e) {
            console.error(JSON.stringify({ t: 'listing', msg: 'photo failed', i, err: String(e.message).slice(0, 200) }))
          }
        }
      }
      await Promise.all(Array.from({ length: 6 }, worker))
      photos = out
        .map((o, i) => o && { id: newId(6), ...o, source: pick.source, sourceUrl: list[i].url, credit: `Listing photo via ${sourceName}`, caption: list[i].caption || '', versions: [] })
        .filter(Boolean)
    }

    const listing = { zillow: z.url || null, redfin: r.url || null, used: pick?.source || null }
    await insertPhotoRows(propertyId, photos, user)
    await setPropertyColumns(propertyId, { facts, listing })
    const clean = photos.map(({ sourceUrl, ...ph }) => ph) // eslint-disable-line no-unused-vars
    const saved = await mutateProperty(propertyId, (p) => ({
      ...p,
      facts: facts || p.facts,
      listing,
      listingChecked: true,
      // Re-running replaces the listing set and keeps the owner's own photos.
      photos: [...clean, ...p.photos.filter((x) => x.source !== 'zillow' && x.source !== 'redfin')],
    }))

    await logSubmission({
      user,
      kind: 'listing_lookup',
      address: addr.formatted || addr.oneLine,
      propertyId,
      lang: body.lang,
      meta: { zillow: { ok: z.ok, n: z.photos?.length || 0, tried: z.tried }, redfin: { ok: r.ok, n: r.photos?.length || 0, tried: r.tried }, used: pick?.source || null, stored: photos.length },
    })
    res._meta = { propertyId, photos: photos.length, used: pick?.source || null }

    send(res, 200, {
      ok: true,
      found: photos.length > 0,
      reason: photos.length ? null : z.reason === 'not_on_zillow' && r.reason === 'not_on_redfin' ? 'not_listed' : 'no_photos',
      facts,
      listing,
      property: saved,
    })
  },
  { name: 'listing', before: requireUser, limit: { hour: 30, day: 120 } },
)

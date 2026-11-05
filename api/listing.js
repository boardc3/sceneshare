import { config } from './_lib/config.js'
import { insertPhotoRows, logSubmission, mutateProperty, setPropertyColumns } from './_lib/db.js'
import { newId, requireOwner, requireUser } from './_lib/gate.js'
import { ApiError, readJson, route, send } from './_lib/http.js'
import { normalize } from './_lib/images.js'
import { fetchHomes, findHomesUrl, homesSlugMatches, isHomesUrl } from './_lib/homes.js'
import { fetchRedfin, findRedfinUrl } from './_lib/redfin.js'
import { canStoreImages, downloadImage, storeImage } from './_lib/storage.js'
import { fetchZillow, findZpid } from './_lib/zillow.js'

export const maxDuration = 300

// Slow half of an address lookup: the home's own listing photos and facts from
// Zillow, Redfin and Homes.com, fetched through ScraperAPI and copied into our own
// storage ("pull the images locally"). Every photo keeps its source for the credit line.
// { url } instead: the owner pasted a listing link — import exactly that page.

const SOURCES = ['zillow', 'redfin', 'homes']
const NAMES = { zillow: 'Zillow', redfin: 'Redfin', homes: 'Homes.com' }
const REFERERS = { zillow: 'https://www.zillow.com/', redfin: 'https://www.redfin.com/', homes: 'https://www.homes.com/' }
const zpidFrom = (u) => /\/(\d+)_zpid\b/.exec(u)?.[1] || null

function linkSource(raw) {
  let u
  try {
    u = new URL(String(raw || '').trim())
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  if (/(^|\.)zillow\.com$/.test(u.hostname) && zpidFrom(u.pathname)) return { source: 'zillow', url: u.href, zpid: zpidFrom(u.pathname) }
  if (/(^|\.)redfin\.com$/.test(u.hostname) && /\/home\/\d+/.test(u.pathname)) return { source: 'redfin', url: `https://www.redfin.com${u.pathname}` }
  if (isHomesUrl(u.href)) return { source: 'homes', url: `https://www.homes.com${u.pathname.endsWith('/') ? u.pathname : `${u.pathname}/`}` }
  return null
}
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
    const miss = (source, reason) => ({ source, ok: false, reason, photos: [] })
    const safe = (source, fn) => fn().catch((e) => miss(source, e.message))
    let results
    const link = body.url ? linkSource(body.url) : null
    if (body.url) {
      // A pasted link: only Zillow, Redfin or Homes.com property pages, and (for
      // Homes.com, whose URL names the address) only one for this home.
      if (!link) throw new ApiError(400, 'bad_listing_url', 'Paste a Zillow, Redfin or Homes.com link to this home’s own page.')
      if (link.source === 'homes' && !homesSlugMatches(/\/property\/([^/]+)\//.exec(link.url)?.[1], addr)) {
        throw new ApiError(400, 'listing_other_home', 'That Homes.com page is for a different address.')
      }
      const one =
        link.source === 'zillow'
          ? await safe('zillow', async () => ({ source: 'zillow', ...(await fetchZillow(link.zpid, { deadline })) }))
          : link.source === 'redfin'
            ? await safe('redfin', async () => ({ source: 'redfin', ...(await fetchRedfin(link.url, { deadline })) }))
            : await safe('homes', async () => ({ source: 'homes', ...(await fetchHomes(link.url, { deadline })) }))
      results = Object.fromEntries(SOURCES.map((k) => [k, k === link.source ? one : miss(k, 'not_asked')]))
    } else {
      const [z, r, h] = await Promise.all([
        safe('zillow', async () => {
          const hit = await findZpid(addr)
          if (!hit) return miss('zillow', 'not_on_zillow')
          return { source: 'zillow', ...(await fetchZillow(hit.zpid, { deadline })) }
        }),
        safe('redfin', async () => {
          const log = {}
          const url = await findRedfinUrl(addr, log)
          if (!url) return { ...miss('redfin', 'not_on_redfin'), search: log.search }
          return { source: 'redfin', search: log.search, ...(await fetchRedfin(url, { deadline })) }
        }),
        safe('homes', async () => {
          const log = {}
          const url = await findHomesUrl(addr, log)
          if (!url) return { ...miss('homes', 'not_on_homes'), search: log.search }
          return { source: 'homes', search: log.search, ...(await fetchHomes(url, { deadline })) }
        }),
      ])
      results = { zillow: z, redfin: r, homes: h }
    }
    const { zillow: z, redfin: r, homes: hm } = results

    // One source, not several: the sites usually carry the same MLS photos, and a
    // gallery of duplicates is worse than any one of them. Most photos wins;
    // Zillow, then Redfin, then Homes.com on a tie.
    const pick = [z, r, hm].filter((x) => x.photos?.length).sort((a, b) => b.photos.length - a.photos.length)[0] || null
    // Facts: Zillow's, with gaps filled from Homes.com.
    const facts = z.facts || hm.facts ? { ...(hm.facts || {}), ...Object.fromEntries(Object.entries(z.facts || {}).filter(([, v]) => v != null && v !== '')) } : null
    const factsFrom = z.facts ? 'zillow' : hm.facts ? 'homes' : null
    const sourceName = NAMES[pick?.source] || 'Zillow'

    let photos = []
    if (pick) {
      const list = pick.photos.slice(0, config.maxListingPhotos)
      const referer = REFERERS[pick.source]
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
              let buf = null
              for (const u of [p.url, ...(p.alternates || [])]) {
                buf = await downloadImage(u, { referer }).catch(() => null)
                if (buf) break
              }
              if (!buf) throw new Error(`download failed: ${p.url}`)
              const n = await normalize(buf, 1600)
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

    const listing = { zillow: z.url || null, redfin: r.url || null, homes: hm.url || null, used: pick?.source || null, factsFrom }
    // A pasted link that found nothing changes nothing.
    if (link && !photos.length) {
      res._meta = { propertyId, photos: 0, used: null, link: link.source }
      return send(res, 200, { ok: true, found: false, reason: 'no_photos', link: link.source })
    }
    await insertPhotoRows(propertyId, photos, user)
    // A pasted link adds to what's known: earlier facts stay, gaps are filled, and the
    // other sites' links are kept.
    const prev = row.data || {}
    const keep = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v != null && v !== ''))
    const finalFacts = link ? (facts || prev.facts ? { ...keep(facts), ...keep(prev.facts) } : null) : facts
    const finalListing = link ? { ...(prev.listing || {}), ...keep(listing), used: listing.used, factsFrom: prev.facts ? prev.listing?.factsFrom || 'zillow' : listing.factsFrom } : listing
    await setPropertyColumns(propertyId, { facts: finalFacts, listing: finalListing })
    const clean = photos.map(({ sourceUrl, ...ph }) => ph) // eslint-disable-line no-unused-vars
    const saved = await mutateProperty(propertyId, (p) => ({
      ...p,
      facts: finalFacts || p.facts,
      listing: finalListing,
      listingChecked: true,
      // Re-running replaces the listing set and keeps the owner's own photos.
      photos: [...clean, ...p.photos.filter((x) => !SOURCES.includes(x.source))],
    }))

    await logSubmission({
      user,
      kind: 'listing_lookup',
      address: addr.formatted || addr.oneLine,
      propertyId,
      lang: body.lang,
      meta: { zillow: { ok: z.ok, n: z.photos?.length || 0, tried: z.tried }, redfin: { ok: r.ok, n: r.photos?.length || 0, tried: r.tried, search: r.search, url: r.url || null }, homes: { ok: hm.ok, n: hm.photos?.length || 0, tried: hm.tried, search: hm.search, url: hm.url || null, reason: hm.reason || null }, link: link?.source || null, used: pick?.source || null, stored: photos.length },
    })
    res._meta = { propertyId, photos: photos.length, used: pick?.source || null }

    send(res, 200, {
      ok: true,
      found: photos.length > 0,
      reason: photos.length ? null : z.reason === 'not_on_zillow' && r.reason === 'not_on_redfin' && hm.reason === 'not_on_homes' ? 'not_listed' : 'no_photos',
      facts: finalFacts,
      listing: finalListing,
      property: saved,
    })
  },
  { name: 'listing', before: requireUser, limit: { hour: 30, day: 120 } },
)

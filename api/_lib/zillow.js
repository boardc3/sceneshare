import { fetchWithTimeout } from './http.js'
import { scraperLadder } from './scraper.js'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

// Zillow's public address autocomplete answers without a scraper and gives the zpid.
// The `_rb` search URL is NOT used: for unlisted or new addresses it silently falls
// back to a city search page geolocated to the proxy (observed 2026-11-04).
export async function findZpid(addr) {
  const q = new URLSearchParams({ q: addr.oneLine, resultTypes: 'allAddress', resultCount: '5' })
  try {
    const r = await fetchWithTimeout(`https://www.zillowstatic.com/autocomplete/v3/suggestions?${q}`, { headers: { 'User-Agent': UA } }, 12000)
    if (!r.ok) return null
    const d = await r.json()
    const unit = (addr.unit || '').replace(/^#/, '').toLowerCase()
    const hits = (d.results || []).filter((x) => x.metaData?.zpid && sameStreetNumber(x.display, addr.streetNumber))
    const exact = hits.find((x) => !unit || x.display.toLowerCase().includes(`#${unit}`) || x.display.toLowerCase().includes(`unit ${unit}`))
    const hit = exact || hits[0]
    return hit ? { zpid: String(hit.metaData.zpid), display: hit.display } : null
  } catch {
    return null
  }
}

// Units Zillow knows at one street address ("1400 Mission St #1303 …"). Zillow's
// suggestions stop at 12 per query, so a building is read with a few prefixed
// queries in parallel (#1 … #9): a 96-unit tower came back whole this way.
// "South Westgate Avenue" (Mapbox) → "S Westgate Ave" (how Zillow writes it).
const ABBR = { north: 'N', south: 'S', east: 'E', west: 'W', northeast: 'NE', northwest: 'NW', southeast: 'SE', southwest: 'SW', avenue: 'Ave', street: 'St', boulevard: 'Blvd', drive: 'Dr', road: 'Rd', lane: 'Ln', court: 'Ct', place: 'Pl', terrace: 'Ter', circle: 'Cir', highway: 'Hwy', parkway: 'Pkwy', way: 'Way', trail: 'Trl', square: 'Sq' }
const DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest'])
export const shortRoute = (route = '') => route.split(/\s+/).map((w) => ABBR[w.toLowerCase()] || w).join(' ')
// The street's own name ("westgate"), ignoring directions and suffixes, to match against.
const streetName = (route = '') => route.toLowerCase().split(/\s+/).find((w) => w && !DIRECTIONS.has(w)) || ''

export async function unitsAt({ streetNumber, route, city, state, zip }) {
  const base = `${streetNumber} ${shortRoute(route)}`.trim()
  const tail = `, ${city || ''}, ${state || ''} ${zip || ''}`.replace(/\s+/g, ' ').trim()
  const street = streetName(route)
  const ask = async (text) => {
    try {
      const q = new URLSearchParams({ q: text, resultTypes: 'allAddress', resultCount: '12' })
      const r = await fetchWithTimeout(`https://www.zillowstatic.com/autocomplete/v3/suggestions?${q}`, { headers: { 'User-Agent': UA } }, 8000)
      if (!r.ok) return []
      return ((await r.json()).results || []).map((x) => ({ display: x.display || '', type: x.metaData?.addressType || '' }))
    } catch {
      return []
    }
  }
  const out = new Set()
  let complex = false
  let bareActive = false // the street address itself is listed now, with no unit
  let unitActive = false // some unit is listed now
  const read = (rows) => {
    for (const { display, type } of rows) {
      if ((street && !display.toLowerCase().includes(street)) || (zip && !display.includes(zip))) continue
      const m = /(?:#|\b(?:apt|unit|ste|suite)\.?\s*#?)\s*([A-Za-z0-9-]{1,12})\b/i.exec(display)
      if (!m) {
        if (sameStreetNumber(display, streetNumber) && ACTIVE.test(type)) bareActive = true
        continue
      }
      if (ACTIVE.test(type)) unitActive = true
      const u = m[1].toUpperCase()
      // A complex filed under one address: "1 Park Newport Dr #4000-204" is unit 204 of building 4000.
      const inBuilding = u.startsWith(`${String(streetNumber).toUpperCase()}-`)
      if (inBuilding) {
        complex = true
        out.add(u.slice(String(streetNumber).length + 1))
      } else if (sameStreetNumber(display, streetNumber) && u.length <= 8) out.add(u)
    }
  }
  read((await Promise.all([`${base}${tail}`, ...['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'PH'].map((p) => `${base} #${p}${tail}`)].map(ask))).flat())
  if (complex) read((await Promise.all(['1', '2', '3', '4', '5', '6'].map((p) => ask(`${base} #${streetNumber}-${p}${tail}`)))).flat())
  // A house on a lot that once held units (21712 Wesley Dr, Laguna Beach: a single-family
  // home listed for sale, plus nine old sold records #1–#9). When the address itself is
  // listed now and none of the units is, the units are history: no picker.
  const historic = bareActive && !unitActive
  return { units: historic ? [] : [...out], single: historic }
}

// Zillow's addressType for a record that's on the market now (sold_address is history).
const ACTIVE = /^(forsale|forrent|pending|comingsoon|coming_soon|newconstruction)/i

const sameStreetNumber = (display = '', num = '') => !!num && display.trim().split(/\s+/)[0] === String(num)

function parseGdp(html, zpid) {
  const m = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (!m) return null
  let data
  try {
    data = JSON.parse(m[1])
  } catch {
    return null
  }
  let cache = data?.props?.pageProps?.componentProps?.gdpClientCache
  if (typeof cache === 'string') {
    try {
      cache = JSON.parse(cache)
    } catch {
      return null
    }
  }
  if (!cache || typeof cache !== 'object') return null
  // Facts come from the gdpClientCache entry whose property.zpid matches — never
  // from page text (the first <article> is a nearby-comp card). Runbook 04.
  for (const entry of Object.values(cache)) {
    const p = entry?.property
    if (p && String(p.zpid) === String(zpid)) return p
  }
  return null
}

function bestJpeg(photo) {
  const list = photo?.mixedSources?.jpeg || []
  if (!list.length) return null
  return [...list].sort((a, b) => (b.width || 0) - (a.width || 0))[0]
}

export async function fetchZillow(zpid, { deadline } = {}) {
  const url = `https://www.zillow.com/homedetails/${zpid}_zpid/`
  const page = await scraperLadder(url, (html) => !!parseGdp(html, zpid), { deadline })
  if (!page.text) return { url, ok: false, tried: page.tried, photos: [], facts: null }
  const p = parseGdp(page.text, zpid)
  const photos = []
  const seen = new Set()
  for (const ph of p.originalPhotos || []) {
    const j = bestJpeg(ph)
    // Off-market homes carry a signed Street View frame in place of photos; we
    // fetch our own Street View, so keep only real listing photos.
    if (!j?.url || seen.has(j.url) || !/^https:\/\/photos\.zillowstatic\.com\//.test(j.url)) continue
    seen.add(j.url)
    photos.push({ url: j.url, width: j.width || null, caption: ph.caption || '' })
  }
  const facts = {
    streetAddress: p.streetAddress,
    city: p.city,
    state: p.state,
    zip: p.zipcode,
    beds: p.bedrooms ?? null,
    baths: p.bathrooms ?? null,
    livingArea: p.livingArea ?? null,
    lotArea: p.lotAreaValue ?? null,
    lotAreaUnit: p.lotAreaUnits || null,
    yearBuilt: p.yearBuilt ?? null,
    homeType: p.homeType || null,
    status: p.homeStatus || null,
    price: p.price || null,
    description: (p.description || '').slice(0, 1200),
    lat: p.latitude ?? null,
    lng: p.longitude ?? null,
  }
  return { url, ok: true, step: page.step, tried: page.tried, photos, facts }
}

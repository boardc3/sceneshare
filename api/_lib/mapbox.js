import { config } from './config.js'
import { ApiError, fetchWithTimeout } from './http.js'

// Mapbox for everything location: address suggestions and geocoding (Geocoding
// API v6) and nearby places (Search Box API category search). Chris, 2026-11-04:
// "use mapbox not google maps".
const GEOCODE = 'https://api.mapbox.com/search/geocode/v6/forward'
const CATEGORY = 'https://api.mapbox.com/search/searchbox/v1/category'

function needToken() {
  if (!config.mapboxToken) throw new ApiError(503, 'maps_not_configured', 'Address lookup is not set up yet. Add MAPBOX_TOKEN in Vercel.')
}

const mbLang = (lang) => (lang === 'zh' ? 'zh-Hans' : 'en')

// "123 Main St #4", "123 Main St Unit 4", "123 Main St, Apt 4B" → "4", "4B"
export function unitFrom(text = '') {
  const m = /(?:#|\b(?:unit|apt|apartment|ste|suite)\.?\s*#?)\s*([A-Za-z0-9-]{1,8})\b/i.exec(text)
  return m ? m[1] : ''
}

function toAddress(f, inputText = '') {
  const p = f.properties || {}
  const c = p.context || {}
  const [lng, lat] = f.geometry?.coordinates || [p.coordinates?.longitude, p.coordinates?.latitude]
  const number = c.address?.address_number || (/^(\d+[A-Za-z]?)\s/.exec(p.name || '') || [])[1] || ''
  const route = c.address?.street_name || c.street?.name || (p.name || '').replace(/^\d+[A-Za-z]?\s+/, '')
  const unit = c.secondary_address?.name ? unitFrom(c.secondary_address.name) || c.secondary_address.name : unitFrom(inputText)
  const addr = {
    formatted: (p.full_address || `${p.name}, ${p.place_formatted}`).replace(/, United States$/, ''),
    streetNumber: number,
    route,
    unit,
    city: c.place?.name || c.locality?.name || c.neighborhood?.name || '',
    county: c.district?.name || '',
    state: c.region?.region_code || '',
    zip: c.postcode?.name || '',
    lat,
    lng,
    precision: p.coordinates?.accuracy || p.match_code?.confidence || null,
    placeId: p.mapbox_id || null,
  }
  addr.oneLine = `${addr.streetNumber} ${addr.route}${addr.unit ? ` #${addr.unit}` : ''}, ${addr.city}, ${addr.state} ${addr.zip}`.trim()
  return addr
}

async function forward(q, { autocomplete, limit, lang, permanent = false }) {
  needToken()
  const params = new URLSearchParams({
    q,
    access_token: config.mapboxToken,
    country: 'us',
    types: 'address,secondary_address',
    autocomplete: String(autocomplete),
    limit: String(limit),
    language: mbLang(lang),
  })
  if (permanent) params.set('permanent', 'true')
  const r = await fetchWithTimeout(`${GEOCODE}?${params}`, {}, 10000)
  if (r.status === 401 || r.status === 403) throw new ApiError(503, 'maps_not_configured', 'The Mapbox token was refused. Check MAPBOX_TOKEN and its URL restrictions.')
  if (!r.ok) throw new ApiError(502, 'geocode_failed', 'Address lookup is unavailable right now. Try again in a moment.')
  const d = await r.json()
  return d.features || []
}

// Units Mapbox knows at a building (secondary addresses), where it has them.
export async function unitsNear(addressText, lang = 'en') {
  try {
    needToken()
    const params = new URLSearchParams({ q: `${addressText} unit`, access_token: config.mapboxToken, country: 'us', types: 'secondary_address', autocomplete: 'true', limit: '10', language: mbLang(lang) })
    const r = await fetchWithTimeout(`${GEOCODE}?${params}`, {}, 8000)
    if (!r.ok) return []
    const d = await r.json()
    return (d.features || []).map((f) => f.properties?.context?.secondary_address?.name || '').map((n) => unitFrom(n) || n).filter((u) => /^[A-Za-z0-9-]{1,8}$/.test(u)).map((u) => u.toUpperCase())
  } catch {
    return []
  }
}

// Put a chosen unit on a geocoded address ("123 Main St #4B, City, ST 92651").
export function withUnit(addr, unit) {
  const u = String(unit || '').replace(/^#/, '').trim().toUpperCase()
  if (!u) return addr
  const street = `${addr.streetNumber} ${addr.route}`.trim()
  const rest = addr.formatted.includes(',') ? addr.formatted.slice(addr.formatted.indexOf(',')) : `, ${addr.city}, ${addr.state} ${addr.zip}`
  const out = { ...addr, unit: u, formatted: `${street} #${u}${rest}` }
  out.oneLine = `${out.streetNumber} ${out.route} #${u}, ${out.city}, ${out.state} ${out.zip}`.trim()
  return out
}

export async function autocomplete(input, lang = 'en') {
  const feats = await forward(input, { autocomplete: true, limit: 6, lang })
  return feats.map((f) => {
    const p = f.properties || {}
    return {
      placeId: p.mapbox_id,
      text: (p.full_address || `${p.name}, ${p.place_formatted}`).replace(/, United States$/, ''),
      main: p.name || '',
      secondary: (p.place_formatted || '').replace(/, United States$/, ''),
    }
  })
}

// Storing a geocode (we keep the address for share links) needs Mapbox's
// permanent geocoding; set MAPBOX_PERMANENT_GEOCODING=1 once the account has it.
export async function geocode({ address, lang = 'en' }) {
  const feats = await forward(address, { autocomplete: false, limit: 1, lang, permanent: config.mapboxPermanent })
  return feats[0] ? toAddress(feats[0], address) : null
}

const toRad = (d) => (d * Math.PI) / 180
export function distanceMeters(a, b) {
  const R = 6371000
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
export function bearing(a, b) {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat))
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Points of interest a buyer actually asks about (doc 07, rule 4): one per
// category, the nearest of a few candidates. Category ids are tried in order
// because Mapbox's canonical list varies by version; the first that answers wins.
// `accept` / `reject` run against the place's name and Mapbox's own category labels,
// so a music studio is not "the nearest school" and a hospice is not "the hospital"
// (both happened on the first live run, 2026-11-04).
// v2 (Chris, 2026-11-04: "more, and classifications closer to the markdown"): each
// category belongs to a group a buyer thinks in — schools, outdoors, everyday,
// health, travel — and schools are split by level. 12 places at most (doc 07: 3–8
// is right, 12 is the ceiling).
const SCHOOL_NOT = /music|dance|driving|art|swim|surf|yoga|studio|tutor|language|pre-?school|day ?care|beauty|cooking|flight|martial|karate|montessori|learning center|college|university|children'?s house|kids|tutoring|kumon|mathnasium/i
// v3 (Chris, 2026-11-10: "all of the maps to have a minimum of 20 locations"): every
// category keeps several candidates; the nearest of each comes first, then the
// next-nearest fill in turn until the map has MIN_PLACES, with pharmacy and gym
// added. Sparse areas get a second, wider pass.
export const MIN_PLACES = 20
const MAX_PLACES = 24
export const POI_VERSION = 4
const POI_CATEGORIES = [
  { key: 'elementary', group: 'schools', ids: ['elementary_school', 'school', 'education'], radius: 4000, accept: /elementary|primary|k-8|k-6/i, reject: SCHOOL_NOT },
  { key: 'middle', group: 'schools', ids: ['middle_school', 'school', 'education'], radius: 6000, accept: /middle|intermediate|junior high/i, reject: SCHOOL_NOT },
  { key: 'high', group: 'schools', ids: ['high_school', 'school', 'education'], radius: 8000, accept: /high school|\bhigh\b|secondary|academy/i, reject: /junior high|middle|elementary|music|dance|driving|swim|surf|tutor|college|university/i },
  { key: 'beach', group: 'outdoors', ids: ['beach'], radius: 8000 },
  { key: 'park', group: 'outdoors', ids: ['park'], radius: 3000, reject: /beach|parking|dog run/i },
  { key: 'grocery', group: 'everyday', ids: ['grocery', 'supermarket'], radius: 5000, reject: /liquor|convenience|7-eleven|gas|smoke|vape/i },
  { key: 'cafe', group: 'everyday', ids: ['coffee', 'cafe'], radius: 2500 },
  { key: 'dining', group: 'everyday', ids: ['restaurant'], radius: 3000, reject: /mcdonald|burger king|taco bell|jack in the box|subway|wendy|kfc|carl'?s|del taco|domino|pizza hut|little caesars/i },
  { key: 'shopping', group: 'everyday', ids: ['shopping_mall', 'shopping_center', 'shopping'], radius: 10000, accept: /center|centre|mall|plaza|village|marketplace|promenade|spectrum|fashion|shops|town|square/i },
  {
    key: 'hospital',
    group: 'health',
    ids: ['hospital', 'health_services'],
    radius: 25000,
    accept: /hospital|medical center/i,
    reject: /hospice|veterinar|animal|dental|clinic|urgent|rehab|behavioral|surgery center|imaging/i,
  },
  { key: 'airport', group: 'travel', ids: ['airport'], radius: 60000, accept: /airport|international/i, reject: /heli|airstrip|seaplane/i },
  { key: 'train', group: 'travel', ids: ['train_station', 'railway_station'], radius: 15000, accept: /station|metrolink|amtrak|transportation center/i },
  { key: 'pharmacy', group: 'health', ids: ['pharmacy'], radius: 6000 },
  { key: 'gym', group: 'everyday', ids: ['fitness_center', 'gym'], radius: 5000 },
]
// How many of a category a map may show (a second airport or hospital is noise).
const MAX_PER = { airport: 1, hospital: 2, train: 2, elementary: 2, middle: 2, high: 2, shopping: 2, pharmacy: 2, gym: 2 }

const label = (p) => [p.name, ...(p.poi_category || []), ...(p.poi_category_ids || [])].filter(Boolean).join(' ')

// The suitable places of one category, nearest first.
async function placesInCategory(cat, lat, lng, lang, widen = 1) {
  for (const id of cat.ids) {
    const params = new URLSearchParams({
      access_token: config.mapboxToken,
      proximity: `${lng},${lat}`,
      origin: `${lng},${lat}`,
      limit: '10',
      language: mbLang(lang),
      country: 'us',
    })
    let r
    try {
      r = await fetchWithTimeout(`${CATEGORY}/${encodeURIComponent(id)}?${params}`, {}, 8000)
    } catch {
      continue
    }
    if (!r.ok) continue // unknown category id → try the next one
    const d = await r.json()
    const found = (d.features || [])
      .map((f) => {
        const p = f.properties || {}
        const loc = { lat: p.coordinates?.latitude ?? f.geometry?.coordinates?.[1], lng: p.coordinates?.longitude ?? f.geometry?.coordinates?.[0] }
        return { p, loc, meters: distanceMeters({ lat, lng }, loc) }
      })
      .filter((x) => Number.isFinite(x.loc.lat) && x.meters <= cat.radius * widen)
      .filter((x) => (!cat.accept || cat.accept.test(label(x.p))) && (!cat.reject || !cat.reject.test(x.p.name || '')))
      .sort((a, b) => a.meters - b.meters)
    if (!found.length) continue // nothing suitable under this id → try the next one
    return found.slice(0, MAX_PER[cat.key] || 6).map((best) => ({
      category: cat.key,
      group: cat.group,
      name: best.p.name || '',
      address: best.p.full_address || best.p.place_formatted || '',
      lat: best.loc.lat,
      lng: best.loc.lng,
      meters: Math.round(best.meters),
      bearing: Math.round(bearing({ lat, lng }, best.loc)),
    }))
  }
  return []
}

// Round-robin over the categories: every nearest first, then seconds, then thirds.
function pickPlaces(lists, max) {
  const out = []
  const seen = new Set() // one place never fills two slots (a K-12 as "elementary" and "high")
  // Ranks past the third are only for reaching the minimum where categories are thin.
  for (let rank = 0; rank < 6; rank++) {
    for (const list of lists) {
      const p = list[rank]
      if (!p || !p.name || seen.has(p.name.toLowerCase())) continue
      if (rank > 0 && out.length >= (rank < 3 ? max : MIN_PLACES)) continue
      seen.add(p.name.toLowerCase())
      out.push(p)
    }
  }
  return out
}

export async function nearby(lat, lng, lang = 'en') {
  if (!config.mapboxToken) return []
  const gather = (widen) => Promise.all(POI_CATEGORIES.map((c) => placesInCategory(c, lat, lng, lang, widen).catch(() => [])))
  let out = pickPlaces(await gather(1), MAX_PLACES)
  // A sparse area: look twice as far before settling for fewer.
  if (out.length < MIN_PLACES) {
    const wider = pickPlaces(await gather(2), MAX_PLACES)
    if (wider.length > out.length) out = wider
  }
  return out
}

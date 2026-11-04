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
const POI_CATEGORIES = [
  { key: 'beach', ids: ['beach'], radius: 8000 },
  { key: 'park', ids: ['park'], radius: 3000, reject: /beach|parking|dog run/i },
  {
    key: 'school',
    ids: ['elementary_school', 'school', 'high_school', 'education'],
    radius: 5000,
    accept: /school|elementary|middle|high|academy|charter|k-8|k-12/i,
    reject: /music|dance|driving|art|swim|surf|yoga|studio|tutor|language|pre-?school|day ?care|beauty|cooking|flight|martial|karate|montessori|learning center|college|university/i,
  },
  { key: 'grocery', ids: ['grocery', 'supermarket'], radius: 5000, reject: /liquor|convenience|7-eleven|gas|smoke|vape/i },
  { key: 'cafe', ids: ['coffee', 'cafe'], radius: 2500 },
  {
    key: 'hospital',
    ids: ['hospital', 'health_services'],
    radius: 25000,
    accept: /hospital|medical center/i,
    reject: /hospice|veterinar|animal|dental|clinic|urgent|rehab|behavioral|surgery center|imaging/i,
  },
  { key: 'airport', ids: ['airport'], radius: 60000, accept: /airport|international/i, reject: /heli|airstrip|seaplane/i },
]

const label = (p) => [p.name, ...(p.poi_category || []), ...(p.poi_category_ids || [])].filter(Boolean).join(' ')

async function nearestInCategory(cat, lat, lng, lang) {
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
    const best = (d.features || [])
      .map((f) => {
        const p = f.properties || {}
        const loc = { lat: p.coordinates?.latitude ?? f.geometry?.coordinates?.[1], lng: p.coordinates?.longitude ?? f.geometry?.coordinates?.[0] }
        return { p, loc, meters: distanceMeters({ lat, lng }, loc) }
      })
      .filter((x) => Number.isFinite(x.loc.lat) && x.meters <= cat.radius)
      .filter((x) => (!cat.accept || cat.accept.test(label(x.p))) && (!cat.reject || !cat.reject.test(x.p.name || '')))
      .sort((a, b) => a.meters - b.meters)[0]
    if (!best) continue // nothing suitable under this id → try the next one
    return {
      category: cat.key,
      name: best.p.name || '',
      address: best.p.full_address || best.p.place_formatted || '',
      lat: best.loc.lat,
      lng: best.loc.lng,
      meters: Math.round(best.meters),
      bearing: Math.round(bearing({ lat, lng }, best.loc)),
    }
  }
  return null
}

export async function nearby(lat, lng, lang = 'en') {
  if (!config.mapboxToken) return []
  const out = await Promise.all(POI_CATEGORIES.map((c) => nearestInCategory(c, lat, lng, lang).catch(() => null)))
  return out.filter(Boolean)
}

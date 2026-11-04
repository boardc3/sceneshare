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

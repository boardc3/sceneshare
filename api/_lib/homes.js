import { LADDER, scraperLadder, webSearch } from './scraper.js'

// Homes.com (CoStar). Its pages and image CDN sit behind Akamai, so both go through
// ScraperAPI. The property page is found through ScraperAPI's Google endpoint and
// matched strictly on street number + street name + city, like Redfin.
// Page URL:  https://www.homes.com/property/7965-w-83rd-st-playa-del-rey-ca/c6krd80yh1e8k/
// Photo URL: https://images.homes.com/listings/{size}/{photoId}-{listingId}/{address-slug}-{kind}.jpg
// Off-market homes keep their last listing's photos on Homes.com, which is often
// the only place they're still published.

const slug = (s = '') =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

const HOST = /(^|\.)homes\.com$/
const PAGE = /^\/property\/([a-z0-9-]+)\/([a-z0-9]+)\/?$/i

export function isHomesUrl(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && HOST.test(url.hostname) && PAGE.test(url.pathname)
  } catch {
    return false
  }
}

// Does this Homes.com page slug ("7965-w-83rd-st-playa-del-rey-ca") name this address?
export function homesSlugMatches(pageSlug, addr) {
  const s = String(pageSlug || '').toLowerCase()
  if (!addr?.streetNumber || !s.startsWith(`${String(addr.streetNumber).toLowerCase()}-`)) return false
  const words = slug(addr.route).split('-').filter((w) => w.length > 2 && !/^(north|south|east|west|street|avenue|drive|road|lane|court|place|boulevard)$/.test(w))
  // "West 83rd Street" → "83rd"; ordinal or plain names must appear in the slug.
  if (words.length && !words.some((w) => s.includes(w))) return false
  const city = slug(addr.city || '')
  if (city && !s.includes(city)) return false
  const unit = String(addr.unit || '').replace(/^#/, '').toLowerCase()
  if (unit && !new RegExp(`-(unit|apt|ste)-?${unit}-|-${unit}-`).test(s)) return false
  return true
}

export async function findHomesUrl(addr, log = {}) {
  if (!addr.streetNumber || !addr.zip) return null
  const found = await webSearch(`homes.com ${addr.streetNumber} ${addr.route} ${addr.unit ? `#${addr.unit} ` : ''}${addr.city} ${addr.state} ${addr.zip}`, { want: /homes\.com\/property\// })
  log.search = found.tried
  for (const l of found.links) {
    if (!isHomesUrl(l)) continue
    const m = PAGE.exec(new URL(l).pathname)
    if (homesSlugMatches(m[1], addr)) return `https://www.homes.com/property/${m[1]}/${m[2]}/`
  }
  return null
}

// Every photo of this home on the page, largest size code first, deduplicated by
// photo id. Only photos whose filename carries this page's own address slug count
// (the page also shows nearby and similar homes).
export function homesPhotos(html, pageSlug) {
  const h = String(html || '').replace(/\\u002F/gi, '/').replace(/\\\//g, '/')
  const re = /https?:\/\/images\.homes\.com\/listings\/(\d+)\/(\d+-\d+)\/([a-z0-9-]+?)-((?:primary|building|interior|exterior|aerial|community|floorplan)?[a-z]*photo(?:-\d+)?)\.(?:jpe?g|webp)/gi
  const byId = new Map()
  let m
  while ((m = re.exec(h))) {
    const [, size, id, fileSlug, kind] = m
    if (pageSlug && fileSlug.toLowerCase() !== String(pageSlug).toLowerCase()) continue
    const cur = byId.get(id) || { id, kind, sizes: new Set(), order: byId.size }
    cur.sizes.add(size)
    byId.set(id, cur)
    cur.slug = fileSlug
  }
  const num = (k) => Number(/-(\d+)$/.exec(k)?.[1] || (/primary/.test(k) ? 1 : 999))
  return [...byId.values()]
    .sort((a, b) => num(a.kind) - num(b.kind) || a.order - b.order)
    .map((p) => {
      // Size codes vary; the larger code has been the larger image so far (102 vs 214
      // is the exception: 102 is the hero). Try the hero size first, then the rest.
      const sizes = [...p.sizes].sort((a, b) => (a === '102' ? -1 : b === '102' ? 1 : Number(b) - Number(a)))
      const urls = [...new Set(['102', ...sizes])].map((s) => `https://images.homes.com/listings/${s}/${p.id}/${p.slug}-${p.kind}.jpg`)
      return { url: urls[0], alternates: urls.slice(1), width: null, caption: '' }
    })
}

// Facts from the page's JSON-LD (schema.org SingleFamilyResidence / Product etc.).
export function homesFacts(html) {
  const blocks = [...String(html || '').matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1])
  const facts = {}
  const visit = (o) => {
    if (!o || typeof o !== 'object') return
    if (Array.isArray(o)) return o.forEach(visit)
    if (o['@graph']) visit(o['@graph'])
    const n = (v) => {
      const x = Number(String(v?.value ?? v ?? '').replace(/[^\d.]/g, ''))
      return Number.isFinite(x) && x > 0 ? x : null
    }
    if (o.numberOfRooms != null || o.numberOfBedrooms != null) facts.beds ??= n(o.numberOfBedrooms ?? o.numberOfRooms)
    if (o.numberOfBathroomsTotal != null || o.numberOfFullBathrooms != null) facts.baths ??= n(o.numberOfBathroomsTotal ?? o.numberOfFullBathrooms)
    if (o.floorSize) facts.livingArea ??= n(o.floorSize)
    if (o.yearBuilt) facts.yearBuilt ??= n(o.yearBuilt)
    if (typeof o.description === 'string' && o.description.length > 80) facts.description ??= o.description.slice(0, 1200)
    for (const v of Object.values(o)) if (v && typeof v === 'object') visit(v)
  }
  for (const b of blocks) {
    try {
      visit(JSON.parse(b))
    } catch {
      /* not JSON */
    }
  }
  return Object.keys(facts).length ? facts : null
}

export async function fetchHomes(url, { deadline } = {}) {
  const pageSlug = PAGE.exec(new URL(url).pathname)?.[1] || null
  // Homes.com's Akamai wall is intermittent (production: plain 500 → premium 200 on one
  // try, 500 on every step the next), so premium gets a second chance.
  const steps = [...LADDER.slice(0, 2), { label: 'premium-again', premium: true }, ...LADDER.slice(2)]
  const page = await scraperLadder(url, (h) => /images\.homes\.com\/listings/i.test(h) && h.length > 20000, { deadline, steps })
  if (!page.text) return { url, ok: false, tried: page.tried, photos: [], facts: null }
  return { url, ok: true, step: page.step, tried: page.tried, photos: homesPhotos(page.text, pageSlug), facts: homesFacts(page.text) }
}

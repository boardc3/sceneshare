import { scraperGoogle, scraperLadder } from './scraper.js'

// Redfin's stingray autocomplete refuses plain and premium ScraperAPI requests
// (500 after ~56 s, observed 2026-11-04), so the property page is found through
// ScraperAPI's Google endpoint and then matched strictly on number + street + zip.
const slug = (s = '') =>
  s
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()

export async function findRedfinUrl(addr) {
  if (!addr.streetNumber || !addr.zip) return null
  const links = await scraperGoogle(`redfin ${addr.streetNumber} ${addr.route} ${addr.unit ? `Unit ${addr.unit} ` : ''}${addr.city} ${addr.state} ${addr.zip}`)
  const want = `${addr.streetNumber}-`
  const routeWord = slug(addr.route).split('-')[0]
  const unit = (addr.unit || '').replace(/^#/, '').toLowerCase()
  const candidates = links.filter((l) => {
    let u
    try {
      u = new URL(l)
    } catch {
      return false
    }
    if (!/(^|\.)redfin\.com$/.test(u.hostname) || !/\/home\/\d+/.test(u.pathname)) return false
    const parts = u.pathname.toLowerCase().split('/')
    const streetPart = parts.find((p) => p.startsWith(want) && p.endsWith(`-${addr.zip}`))
    if (!streetPart || !streetPart.includes(routeWord)) return false
    if (unit && !u.pathname.toLowerCase().includes(`/unit-${unit}/`)) return false
    return true
  })
  return candidates[0] || null
}

const unescape = (h) => h.replace(/\\u002F/gi, '/').replace(/\\\//g, '/')

function listingKey(u) {
  let m = /cdn-redfin\.com\/photo\/(\d+)\/[a-z]+\/(\d+)\/([A-Za-z0-9-]+?)(?:_\d+)*(?:_[A-Za-z0-9]+)?\.jpg/.exec(u)
  if (m) return `${m[1]}/${m[2]}/${m[3].split('_')[0]}`
  m = /cdn-redfin\.com\/photo\/rent\/([0-9a-f-]{36})\//.exec(u)
  return m ? `rent/${m[1]}` : null
}

function toBig(u) {
  return u.replace(/\/(mbphoto|mbpaddedwide|islphoto|bcsphoto|rcsphoto)\//, '/bigphoto/').replace(/\/(genMid|genIsl|genBcs)\./, '/')
}

export async function fetchRedfin(url, { deadline } = {}) {
  const page = await scraperLadder(url, (h) => /cdn-redfin\.com|<title>/i.test(h) && h.length > 20000, { deadline })
  if (!page.text) return { url, ok: false, tried: page.tried, photos: [] }
  const h = unescape(page.text)
  // Only this home's photos: an off-market page also carries nearby listings' photos.
  // The page's og:image is this home's primary photo when it has one; take only the
  // photos that share its listing key. No og photo → this home has no listing photos.
  const og = /property="og:image" content="([^"]+)"/.exec(h)?.[1] || ''
  const key = listingKey(og)
  if (!key) return { url, ok: true, step: page.step, tried: page.tried, photos: [] }
  const all = h.match(/https?:\/\/ssl\.cdn-redfin\.com\/photo\/[^"'\s\\)]+?\.jpg/g) || []
  const seen = new Set()
  const photos = []
  for (const raw of all) {
    if (listingKey(raw) !== key) continue
    const big = toBig(raw.replace(/^http:/, 'https:'))
    if (seen.has(big)) continue
    seen.add(big)
    photos.push({ url: big, width: null, caption: '' })
  }
  return { url, ok: true, step: page.step, tried: page.tried, photos }
}

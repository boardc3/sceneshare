import { put } from '@vercel/blob'
import { config } from './config.js'
import { fetchWithTimeout } from './http.js'
import { scraperFetch } from './scraper.js'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

// Hosts the server may download photos from. Everything else is refused, so the
// image endpoints cannot be used as an open proxy.
const ALLOWED_HOSTS = [
  /(^|\.)zillowstatic\.com$/,
  /(^|\.)cdn-redfin\.com$/,
  /(^|\.)public\.blob\.vercel-storage\.com$/,
]

export function isAllowedImageUrl(u) {
  try {
    const url = new URL(u)
    return url.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}

function looksLikeImage(buf, contentType) {
  if (!buf || buf.length < 1024) return false
  if (contentType && /text\/html|application\/json/.test(contentType)) return false
  const b = buf
  const jpg = b[0] === 0xff && b[1] === 0xd8
  const png = b[0] === 0x89 && b[1] === 0x50
  const webp = b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP'
  const avif = b.slice(4, 12).toString().includes('ftyp')
  return jpg || png || webp || avif
}

// Download photo bytes. CDN first with a browser UA (CDNs usually allow it),
// then through ScraperAPI when the CDN refuses — runbook 04, "Photos".
export async function downloadImage(url, { referer } = {}) {
  if (!isAllowedImageUrl(url)) throw new Error(`host not allowed: ${url}`)
  try {
    const r = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/jpeg,*/*', ...(referer ? { Referer: referer } : {}) } },
      20000,
    )
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer())
      if (looksLikeImage(buf, r.headers.get('content-type'))) return buf
    }
  } catch {
    /* fall through to the scraper */
  }
  if (config.scraperKey) {
    const r = await scraperFetch(url, { binary: true, timeoutMs: 45000 })
    if (r.ok && looksLikeImage(r.buffer, r.contentType)) return r.buffer
  }
  throw new Error(`download failed: ${url}`)
}

// Store bytes in Vercel Blob. Returns the public URL, or null when Blob is not configured.
export async function storeImage(buffer, path, contentType = 'image/jpeg') {
  if (!config.blobToken) return null
  const res = await put(path, buffer, {
    access: 'public',
    contentType,
    addRandomSuffix: true,
    token: config.blobToken,
  })
  return res.url
}

export const toDataUrl = (buf, type = 'image/jpeg') => `data:${type};base64,${buf.toString('base64')}`

export function fromDataUrl(dataUrl) {
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/s.exec(dataUrl || '')
  if (!m) return null
  return { mimeType: m[1], buffer: Buffer.from(m[2].replace(/\s/g, ''), 'base64') }
}

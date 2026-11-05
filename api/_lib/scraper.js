import { config } from './config.js'
import { fetchWithTimeout } from './http.js'

// ScraperAPI, per runbook 04 "THE SCRAPER IS ALLOWED": public pages only, never
// log the key, escalate one step at a time only when the cheaper step fails.
// Credits per request (ScraperAPI docs, 2026-09-15): plain 1 → render 10 →
// premium 10 → premium+render 25.
export const LADDER = [
  { label: 'plain' },
  { label: 'premium', premium: true },
  { label: 'premium+render', premium: true, render: true },
]

export async function scraperFetch(url, { premium = false, render = false, binary = false, timeoutMs = 70000 } = {}) {
  if (!config.scraperKey) return { ok: false, status: 0, reason: 'no_key' }
  const q = new URLSearchParams({ api_key: config.scraperKey, url, country_code: 'us' })
  if (premium) q.set('premium', 'true')
  if (render) q.set('render', 'true')
  try {
    const r = await fetchWithTimeout(`https://api.scraperapi.com/?${q}`, {}, timeoutMs)
    const contentType = r.headers.get('content-type') || ''
    if (binary) return { ok: r.ok, status: r.status, contentType, buffer: Buffer.from(await r.arrayBuffer()) }
    return { ok: r.ok, status: r.status, contentType, text: await r.text() }
  } catch (e) {
    return { ok: false, status: 0, reason: e.name === 'AbortError' ? 'timeout' : 'network' }
  }
}

// Walk the ladder until `accept(text)` says the page is the real one.
export async function scraperLadder(url, accept, { deadline = Date.now() + 120000, steps = LADDER } = {}) {
  const tried = []
  for (const step of steps) {
    const left = deadline - Date.now()
    if (left < 8000) break
    const r = await scraperFetch(url, { ...step, timeoutMs: Math.min(70000, left) })
    tried.push(`${step.label}:${r.status || r.reason}`)
    if (r.ok && accept(r.text)) return { text: r.text, step: step.label, tried }
  }
  return { text: null, step: null, tried }
}

// Web search for a listing page, with fallbacks: ScraperAPI's structured Google
// endpoint, then Bing through ScraperAPI, then DuckDuckGo's HTML page directly.
// (Production showed the Google route returning nothing for every address, so a
// single engine is not enough.) Returns the result links plus what was tried.
const decodeEntities = (s) => s.replace(/&amp;/g, '&').replace(/&#x2F;/gi, '/').replace(/&#47;/g, '/')

export function bingLinks(html) {
  const out = []
  for (const m of String(html || '').matchAll(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/gi)) {
    let href = decodeEntities(m[1])
    // Bing's click-tracking links carry the target as base64 in u=a1…
    const u = /[?&]u=a1([A-Za-z0-9_-]+)/.exec(href)?.[1]
    if (u) {
      try {
        href = Buffer.from(u.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      } catch {
        continue
      }
    }
    if (/^https?:\/\//.test(href)) out.push(href)
  }
  return out
}

export function ddgLinks(html) {
  const out = []
  for (const m of String(html || '').matchAll(/class="result__a"[^>]*href="([^"]+)"|href="([^"]+)"[^>]*class="result__a"/gi)) {
    const href = decodeEntities(m[1] || m[2])
    const u = /[?&]uddg=([^&]+)/.exec(href)?.[1]
    const target = u ? decodeURIComponent(u) : href.startsWith('//') ? `https:${href}` : href
    if (/^https?:\/\//.test(target)) out.push(target)
  }
  return out
}

export async function webSearch(queryText, { want = null, timeoutMs = 30000 } = {}) {
  const tried = []
  const keep = (links) => (want ? links.filter((l) => want.test(l)) : links)
  if (config.scraperKey) {
    try {
      const q = new URLSearchParams({ api_key: config.scraperKey, query: queryText, country_code: 'us' })
      const r = await fetchWithTimeout(`https://api.scraperapi.com/structured/google/search?${q}`, {}, timeoutMs)
      const links = r.ok ? ((await r.json()).organic_results || []).map((x) => x.link).filter(Boolean) : []
      tried.push(`google:${r.status}:${links.length}`)
      if (keep(links).length) return { links: keep(links), tried, engine: 'google' }
    } catch (e) {
      tried.push(`google:${e.name === 'AbortError' ? 'timeout' : 'error'}`)
    }
    const bing = await scraperFetch(`https://www.bing.com/search?q=${encodeURIComponent(queryText)}&setlang=en-US&cc=US`, { timeoutMs })
    const bl = bing.ok ? bingLinks(bing.text) : []
    tried.push(`bing:${bing.status || bing.reason}:${bl.length}`)
    if (keep(bl).length) return { links: keep(bl), tried, engine: 'bing' }
  }
  try {
    const r = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryText)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', Accept: 'text/html' } },
      15000,
    )
    const dl = r.ok ? ddgLinks(await r.text()) : []
    tried.push(`ddg:${r.status}:${dl.length}`)
    if (keep(dl).length) return { links: keep(dl), tried, engine: 'ddg' }
  } catch (e) {
    tried.push(`ddg:${e.name === 'AbortError' ? 'timeout' : 'error'}`)
  }
  return { links: [], tried, engine: null }
}

// Kept for callers that only want links.
export async function scraperGoogle(queryText, timeoutMs = 30000) {
  return (await webSearch(queryText, { timeoutMs })).links
}

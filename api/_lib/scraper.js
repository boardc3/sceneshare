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

// Google results through ScraperAPI's structured endpoint (used to find a Redfin page).
export async function scraperGoogle(queryText, timeoutMs = 30000) {
  if (!config.scraperKey) return []
  const q = new URLSearchParams({ api_key: config.scraperKey, query: queryText, country_code: 'us' })
  try {
    const r = await fetchWithTimeout(`https://api.scraperapi.com/structured/google/search?${q}`, {}, timeoutMs)
    if (!r.ok) return []
    const d = await r.json()
    return (d.organic_results || []).map((x) => x.link).filter(Boolean)
  } catch {
    return []
  }
}

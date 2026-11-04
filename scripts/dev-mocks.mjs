// Local preview without production keys (npm run dev:demo). Preloaded into the
// Vite dev server, it stands in for the services a laptop has no keys for:
//   · Neon Auth  — a tiny in-memory sign-in service (accounts kept in .data/demo-auth.json)
//   · Gemini     — returns the sample "after" image instead of a real restyle
//   · ScraperAPI — returns six sample listing photos for any address
// Mapbox and the county parcel service stay real when MAPBOX_TOKEN is set.
// Never loaded in production.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()

// Preview settings (no secrets). A MAPBOX_TOKEN can go in .data/demo-keys.json
// ({ "MAPBOX_TOKEN": "pk.…" }) for real maps and real address search.
const defaults = {
  DATABASE_URL: 'pglite://./.data/demo-db',
  SCENESHARE_NEON_AUTH_BASE_URL: 'https://auth.demo/neondb/auth',
  GOOGLE_API_KEY: 'demo',
  SCRAPERAPI_KEY: 'demo',
  ADMIN_EMAILS: 'chris@ccolbert.com',
}
try {
  Object.assign(defaults, JSON.parse(fs.readFileSync(path.join(ROOT, '.data/demo-keys.json'), 'utf8')))
} catch {
  /* no keys file: maps stay off */
}
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v
const simulate = { gemini: process.env.GOOGLE_API_KEY === 'demo', scraper: process.env.SCRAPERAPI_KEY === 'demo' }
const before = fs.readFileSync(path.join(ROOT, 'public/media/demo-before.jpg'))
const after = fs.readFileSync(path.join(ROOT, 'public/media/demo-after.jpg'))
const STORE = path.join(ROOT, '.data/demo-auth.json')
fs.mkdirSync(path.dirname(STORE), { recursive: true })
const saved = fs.existsSync(STORE) ? JSON.parse(fs.readFileSync(STORE, 'utf8')) : { users: {}, sessions: {} }
const persist = () => fs.writeFileSync(STORE, JSON.stringify(saved))

const COOKIE = '__Secure-neon-auth.session_token'
const now = () => new Date().toISOString()
const json = (body, init = {}) => new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) } })

function sessionFrom(cookie = '') {
  const m = /__Secure-neon-auth\.session_token=([^;]+)/.exec(cookie)
  if (!m) return null
  const tok = decodeURIComponent(m[1]).split('.')[0]
  const uid = saved.sessions[tok]
  const user = Object.values(saved.users).find((u) => u.id === uid)
  return user ? { session: { id: 's' + tok, token: tok, userId: uid, expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), createdAt: now(), updatedAt: now() }, user } : null
}
function issue(user) {
  const tok = 'tok' + Math.random().toString(36).slice(2, 14)
  saved.sessions[tok] = user.id
  persist()
  return json({ token: tok, user }, { headers: { 'set-cookie': `${COOKIE}=${tok}.demo; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=604800` } })
}

async function fakeAuth(u, opts) {
  const p = u.pathname.replace(/^.*\/auth\//, '')
  const h = new Headers(opts?.headers || {})
  const body = opts?.body ? JSON.parse(opts.body) : {}
  const email = String(body.email || '').toLowerCase()
  switch (p) {
    case 'sign-up/email': {
      if (saved.users[email]) return json({ code: 'USER_ALREADY_EXISTS', message: 'User already exists' }, { status: 422 })
      const user = { id: 'demo-' + Math.random().toString(36).slice(2, 10), email, name: body.name || '', emailVerified: true, image: null, createdAt: now(), updatedAt: now(), pw: body.password }
      saved.users[email] = user
      return issue(user)
    }
    case 'sign-in/email': {
      const user = saved.users[email]
      if (!user || user.pw !== body.password) return json({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, { status: 401 })
      return issue(user)
    }
    case 'sign-in/social': {
      // No Google on a laptop preview: sign in as a demo Google user and come straight back.
      const user = saved.users['demo.google@sceneshare.test'] || (saved.users['demo.google@sceneshare.test'] = { id: 'demo-google', email: 'demo.google@sceneshare.test', name: 'Demo Google', emailVerified: true, image: null, createdAt: now(), updatedAt: now() })
      const r = issue(user)
      const back = new URL(body.callbackURL || 'http://localhost:5173/')
      return json({ url: back.toString(), redirect: true }, { headers: { 'set-cookie': r.headers.get('set-cookie') } })
    }
    case 'get-session':
      return json(sessionFrom(h.get('cookie') || ''))
    case 'sign-out':
      return json({ success: true }, { headers: { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None` } })
    case 'request-password-reset':
    case 'email-otp/send-verification-otp':
      return json({ status: true, success: true })
    case 'email-otp/verify-email':
      return json({ status: true })
    case 'delete-user': {
      const s = sessionFrom(h.get('cookie') || '')
      if (s) delete saved.users[s.user.email]
      persist()
      return json({ success: true })
    }
    default:
      return json({ message: 'not found' }, { status: 404 })
  }
}

const N = 6
const listingPage = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { componentProps: { gdpClientCache: JSON.stringify({ q: { property: { zpid: 999, bedrooms: 4, bathrooms: 3, livingArea: 2840, lotAreaValue: 7200, lotAreaUnits: 'sqft', yearBuilt: 1979, homeType: 'SINGLE_FAMILY', homeStatus: 'FOR_SALE', price: 2450000, originalPhotos: Array.from({ length: N }, (_, n) => ({ caption: `Room ${n + 1}`, mixedSources: { jpeg: [{ url: `https://photos.zillowstatic.com/fp/demo${n}-uncropped_scaled_within_1536_1152.jpg`, width: 1536 }] } })) } } }) } } } })}</script></html>`

const realFetch = globalThis.fetch
globalThis.fetch = async (url, opts) => {
  const u = new URL(String(url instanceof Request ? url.url : url))
  if (u.hostname === 'auth.demo') {
    if (url instanceof Request) opts = { method: url.method, headers: url.headers, body: url.method === 'GET' ? undefined : await url.text() }
    return fakeAuth(u, opts)
  }
  if (simulate.scraper && u.hostname === 'www.zillowstatic.com') return json({ results: [{ display: 'Demo listing', metaData: { zpid: 999 } }] })
  if (simulate.scraper && u.hostname === 'api.scraperapi.com' && u.pathname.includes('structured/google')) return json({ organic_results: [] })
  if (simulate.scraper && u.hostname === 'api.scraperapi.com') return new Response(listingPage, { headers: { 'content-type': 'text/html' } })
  if (simulate.scraper && u.hostname === 'photos.zillowstatic.com') return new Response(before, { headers: { 'content-type': 'image/jpeg' } })
  if (simulate.gemini && u.hostname === 'generativelanguage.googleapis.com') {
    await new Promise((r) => setTimeout(r, 2500 + Math.random() * 2500))
    return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/jpeg', data: after.toString('base64') } }] } }] })
  }
  return realFetch(url, opts)
}
console.log('\n  Sceneshare local preview: sign-in, listing photos and restyles are simulated on this computer.\n')

import { createHash } from 'node:crypto'
import { createAuthServer, handleAuthProxyRequest, NEON_AUTH_SESSION_COOKIE_NAME, resolveNeonAuthLogging, serializeSetCookie } from '@neondatabase/auth/server'
import { config, isTrustedOrigin } from './config.js'

// Accounts run on Neon Auth (managed Better Auth) in the same Neon project as the
// data. The browser never calls Neon Auth directly: /api/auth/* proxies it, so the
// session cookie is a first-party, HttpOnly, SameSite=Lax cookie on our own domain
// (Safari and every privacy mode keep it), and Google sign-in returns to our pages.

export const authEnabled = () => Boolean(config.authUrl && config.databaseUrl)

// Neon Auth's own warnings and errors, as one JSON line each in the Vercel logs.
const line = (level) => (msg, meta) => console[level](JSON.stringify({ t: 'auth', level, msg, ...(meta || {}) }).slice(0, 2000))
const authLog = resolveNeonAuthLogging({ logLevel: 'warn', logger: { error: line('error'), warn: line('warn'), info: line('info'), debug: line('debug') } })

// Signs the short-lived session cache cookie (5 min) so most requests skip a round
// trip to Neon Auth. Derived from a server-only secret; never sent anywhere.
let secret = null
function cookieSecret() {
  if (!secret) secret = createHash('sha256').update(`sceneshare-auth-cookie-v1|${config.authSecret || config.databaseUrl}`).digest('base64url')
  return secret
}

// The origin the browser is on — what Neon Auth checks against its trusted domains.
// The site's own origin for links we build (share emails, Stripe return URLs, auth
// callbacks). Only known Sceneshare origins are accepted from the request; anything
// else falls back to the canonical site, so a forged Origin/Host header can't point
// a link somewhere else.
export { isTrustedOrigin }
export function originOf(req) {
  const h = req.headers || {}
  if (isTrustedOrigin(h.origin)) return h.origin
  const host = String(h['x-forwarded-host'] || h.host || '').split(',')[0].trim()
  const proto = String(h['x-forwarded-proto'] || (/^(localhost|127\.)/.test(host) ? 'http' : 'https')).split(',')[0].trim()
  const built = `${proto}://${host}`
  return isTrustedOrigin(built) ? built : config.siteUrl
}

async function readRaw(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return JSON.stringify(req.body)
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

// /api/auth/<path> → <NEON_AUTH_BASE_URL>/<path>, cookies rewritten to our domain.
export async function proxyAuth(req, res, path) {
  const url = new URL(req.url, originOf(req))
  url.searchParams.delete('__path')
  const headers = new Headers()
  for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
  if (!headers.get('origin')) headers.set('origin', originOf(req))
  const body = await readRaw(req)
  const request = new Request(url.toString(), { method: req.method, headers, body: body || undefined })
  const response = await handleAuthProxyRequest({
    request,
    path,
    baseUrl: config.authUrl,
    cookieSecret: cookieSecret(),
    sameSite: 'lax',
    log: authLog,
  })
  res.statusCode = response.status
  for (const [k, v] of response.headers) {
    if (k === 'set-cookie' || k === 'content-encoding' || k === 'content-length') continue
    res.setHeader(k, v)
  }
  const cookies = response.headers.getSetCookie()
  if (cookies.length) res.setHeader('Set-Cookie', cookies)
  res.setHeader('Cache-Control', 'no-store')
  const buf = Buffer.from(await response.arrayBuffer())
  res.end(buf)
  return response.status
}

function serverFor(req, res) {
  const ctx = {
    getCookies: () => req.headers.cookie || '',
    setCookie: (name, value, opts = {}) => {
      if (res.headersSent) return
      const prev = res.getHeader('Set-Cookie')
      const line = serializeSetCookie({ ...opts, name, value })
      res.setHeader('Set-Cookie', [...(Array.isArray(prev) ? prev : prev ? [String(prev)] : []), line])
    },
    getHeader: (name) => req.headers[String(name).toLowerCase()] ?? null,
    getOrigin: () => originOf(req),
    getFramework: () => 'vercel-node',
  }
  return createAuthServer({ baseUrl: config.authUrl, context: () => ctx, cookieSecret: cookieSecret(), sameSite: 'lax', log: authLog })
}

// The signed-in user for this request, or null. Never throws: an auth outage
// reads as "signed out", and endpoints that need a user say so plainly.
export async function sessionUser(req, res) {
  if (req._user !== undefined) return req._user
  req._user = null
  if (!authEnabled()) return null
  if (!String(req.headers.cookie || '').includes(NEON_AUTH_SESSION_COOKIE_NAME)) return null
  try {
    const { data } = await serverFor(req, res).getSession()
    const u = data?.user
    if (u?.id) {
      req._user = {
        id: String(u.id),
        email: String(u.email || '').toLowerCase(),
        name: u.name || '',
        image: u.image || null,
        emailVerified: Boolean(u.emailVerified),
      }
    }
  } catch (e) {
    console.error(JSON.stringify({ t: 'auth', msg: 'session lookup failed', err: String(e?.message || e).slice(0, 200) }))
  }
  return req._user
}

// Calls a Neon Auth endpoint as the signed-in user (e.g. delete-user).
export async function authCall(req, res, path, { method = 'POST', body = {} } = {}) {
  const r = await fetch(`${config.authUrl}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: req.headers.cookie || '', Origin: originOf(req) },
    body: method === 'GET' ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  })
  let data = null
  try {
    data = await r.json()
  } catch {
    /* empty */
  }
  return { ok: r.ok, status: r.status, data }
}

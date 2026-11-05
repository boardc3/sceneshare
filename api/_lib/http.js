import { recentRequests } from './db.js'
import { ipHash, logRequest } from './log.js'

// Small helpers that work the same on Vercel's Node runtime and in the local
// Vite dev adapter (vite.config.js). Handlers only use plain Node req/res.

export async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  try {
    if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}
    if (Buffer.isBuffer(req.body)) return req.body.length ? JSON.parse(req.body.toString('utf8')) : {}
    const chunks = []
    for await (const c of req) chunks.push(c)
    const raw = Buffer.concat(chunks).toString('utf8')
    return raw ? JSON.parse(raw) : {}
  } catch {
    throw new ApiError(400, 'bad_json', 'That request could not be read.')
  }
}

export function query(req) {
  const u = new URL(req.url, 'http://local')
  return Object.fromEntries(u.searchParams.entries())
}

export function send(res, status, body, headers = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(JSON.stringify(body))
}

export function fail(res, status, code, message, extra = {}) {
  res._code = code
  send(res, status, { ok: false, error: code, message, ...extra })
}

export class ApiError extends Error {
  constructor(status, code, publicMessage, extra = null) {
    super(publicMessage)
    this.status = status
    this.code = code
    this.publicMessage = publicMessage
    this.extra = extra
  }
}

// Rate limits, counted from api_log: per account when signed in, else per hashed IP.
async function enforceLimit(req, name, { hour, day }, method = null) {
  const key = { route: name, ipHash: ipHash(req), userId: req._user?.id || null, method }
  if (!key.userId && !key.ipHash) return
  const tooMany = async (n, minutes) => n && (await recentRequests({ ...key, minutes })) >= n
  if ((await tooMany(hour, 60)) || (await tooMany(day, 1440))) {
    throw new ApiError(429, 'rate_limited', 'That’s a lot in a short time. Please wait a few minutes and try again.')
  }
}

// Wrap a handler: method check, optional sign-in hook and rate limit, JSON errors
// instead of bare 500s, and one log line + api_log row per request.
//   route(['POST'], fn, { name: 'render', before: requireUser, limit: { hour: 300, day: 1500 } })
export function route(methods, fn, opts = {}) {
  return async (req, res) => {
    const started = Date.now()
    const name = opts.name || new URL(req.url, 'http://local').pathname.replace(/^\/api\//, '')
    try {
      if (!methods.includes(req.method)) throw new ApiError(405, 'method_not_allowed', `Use ${methods.join(' or ')}.`)
      if (opts.before) await opts.before(req, res)
      // `limit` may vary by method: { GET: {...}, POST: {...} } (a method left out is unlimited).
      const perMethod = opts.limit && !(opts.limit.hour || opts.limit.day)
      const lim = perMethod ? opts.limit[req.method] : opts.limit
      if (lim) await enforceLimit(req, name, lim, perMethod ? req.method : null)
      await fn(req, res)
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 500
      res._code = err.code || 'server_error'
      res._err = { message: err instanceof ApiError ? err.publicMessage || err.message : String(err?.message || err), stack: status >= 500 ? String(err?.stack || '').slice(0, 3000) : null }
      if (!(err instanceof ApiError) || err.status >= 500) {
        console.error(JSON.stringify({ t: 'error', route: name, err: String(err?.stack || err).slice(0, 1500) }))
      }
      if (!res.headersSent) {
        send(res, status, { ok: false, error: res._code, message: err.publicMessage || 'Something went wrong on our side. Try again in a moment.', ...(err.extra || {}) })
      }
    } finally {
      logRequest(req, { route: name, status: res.statusCode || 500, ms: Date.now() - started, code: res._code || null, meta: res._meta || null, error: res._err || null })
    }
  }
}

// fetch with a hard timeout (runbook 04: strict timeouts, never wait on a hang)
export async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

export const isEmail = (s) => typeof s === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(s.trim())

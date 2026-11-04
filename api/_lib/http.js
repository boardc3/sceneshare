// Small helpers that work the same on Vercel's Node runtime and in the local
// Vite dev adapter (vite.config.js). Handlers only use plain Node req/res.

export async function readJson(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (typeof req.body === 'string') return req.body ? JSON.parse(req.body) : {}
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  return raw ? JSON.parse(raw) : {}
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
  send(res, status, { ok: false, error: code, message, ...extra })
}

// Wrap a handler so thrown errors become JSON instead of a bare 500.
export function route(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) return fail(res, 405, 'method_not_allowed', `Use ${methods.join(' or ')}.`)
    try {
      await fn(req, res)
    } catch (err) {
      if (!(err instanceof ApiError) || err.status >= 500) console.error('[api]', req.url, err)
      if (!res.headersSent) fail(res, err.status || 500, err.code || 'server_error', err.publicMessage || 'Something went wrong on our side. Try again in a moment.')
    }
  }
}

export class ApiError extends Error {
  constructor(status, code, publicMessage) {
    super(publicMessage)
    this.status = status
    this.code = code
    this.publicMessage = publicMessage
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

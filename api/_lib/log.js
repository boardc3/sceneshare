import { createHash } from 'node:crypto'
import { waitUntil } from '@vercel/functions'
import { config } from './config.js'
import { insertApiLog, insertErrors, visitor } from './db.js'

// "Log everything": every API request becomes one JSON line in Vercel's runtime
// logs and one row in Neon's api_log (route, status, duration, user, error code).
// IP addresses are never stored — only a salted one-way hash, used for rate limits.

export function clientIp(req) {
  const h = req.headers || {}
  const xf = String(h['x-forwarded-for'] || '').split(',')[0].trim()
  return xf || String(h['x-real-ip'] || '') || req.socket?.remoteAddress || ''
}

let salt = null
export function ipHash(req) {
  const ip = clientIp(req)
  if (!ip) return null
  if (!salt) salt = createHash('sha256').update(`sceneshare-ip-v1|${config.authSecret || config.databaseUrl || 'dev'}`).digest('hex')
  return createHash('sha256').update(salt + ip).digest('hex').slice(0, 32)
}

const ID = /^[a-z0-9]{8,40}$/
export const visitorId = (req) => (ID.test(req.headers?.['x-ss-visitor'] || '') ? req.headers['x-ss-visitor'] : null)
export const sessionId = (req) => (ID.test(req.headers?.['x-ss-session'] || '') ? req.headers['x-ss-session'] : null)

// Keep the function alive until a background write lands (no-op outside Vercel).
export function background(promise) {
  try {
    waitUntil(Promise.resolve(promise).catch(() => null))
  } catch {
    /* not on Vercel */
  }
}

export function logRequest(req, { route, status, ms, code = null, meta = null, error = null }) {
  const rec = {
    method: req.method,
    route: String(route || '').slice(0, 60),
    status,
    ms,
    userId: req._user?.id || null,
    ipHash: ipHash(req),
    visitorId: visitorId(req),
    country: visitor(req).country,
    code: code ? String(code).slice(0, 60) : null,
    meta,
  }
  const { ipHash: _h, ...line } = rec // eslint-disable-line no-unused-vars
  const out = JSON.stringify({ t: 'req', ...line })
  if (status >= 500) console.error(out)
  else console.log(out)
  background(insertApiLog(rec))
  // Every failed request also goes to the error log (reviewed on /admin). The
  // browser's own error reports are logged by their route, not again here.
  if (status >= 400 && route !== 'errors') {
    const ua = String(req.headers?.['user-agent'] || '')
    background(
      insertErrors([
        {
          source: 'server',
          level: status >= 500 ? 'error' : 'warning',
          method: req.method,
          route: rec.route,
          path: String(req.url || '').split('?')[0].replace(/^\/api\/app$/, `/api/${rec.route}`),
          status,
          code: rec.code,
          message: error?.message || null,
          detail: [error?.stack, meta ? `meta: ${JSON.stringify(meta).slice(0, 800)}` : null].filter(Boolean).join('\n') || null,
          userId: rec.userId,
          visitorId: rec.visitorId,
          requestId: req.headers?.['x-vercel-id'] || null,
          ipHash: rec.ipHash,
          country: rec.country,
          device: /mobi|iphone|android/i.test(ua) ? 'mobile' : /ipad|tablet/i.test(ua) ? 'tablet' : 'desktop',
        },
      ]).catch(() => {}),
    )
  }
}

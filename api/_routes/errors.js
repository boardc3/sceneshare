import { sessionUser } from '../_lib/auth.js'
import { insertErrors, visitor } from '../_lib/db.js'
import { readJson, route, send } from '../_lib/http.js'
import { ipHash, visitorId } from '../_lib/log.js'

// The browser's side of the error log: requests that failed as the visitor saw
// them (with whether the page explained it or a notice did) and JavaScript crashes.
// Always accepted — errors are needed to run the service, whatever the analytics
// choice — but they carry no analytics ids unless the visitor allowed them.
//   POST { errors: [{ source: 'api'|'browser', method, path, status, code, message, detail, requestId, shown, page, at }], lang }
const SOURCES = ['api', 'browser']
const clip = (v, n) => (v == null ? null : String(v).slice(0, n))

export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const user = await sessionUser(req, res).catch(() => null)
    const v = visitor(req)
    const ua = String(req.headers?.['user-agent'] || '')
    if (/bot|crawl|spider|headless|lighthouse/i.test(ua)) return send(res, 200, { ok: true, n: 0 })
    const device = /ipad|tablet/i.test(ua) ? 'tablet' : /mobi|iphone|android/i.test(ua) ? 'mobile' : 'desktop'
    const rows = (Array.isArray(body.errors) ? body.errors : [])
      .slice(0, 20)
      .filter((e) => e && SOURCES.includes(e.source))
      .map((e) => ({
        at: e.at && !Number.isNaN(Date.parse(e.at)) && Math.abs(Date.now() - Date.parse(e.at)) < 864e5 ? new Date(e.at).toISOString() : new Date().toISOString(),
        source: e.source,
        level: e.source === 'api' && Number(e.status) > 0 && Number(e.status) < 500 && e.code !== 'network' ? 'warning' : 'error',
        method: clip(e.method, 10),
        route: e.source === 'api' ? clip(String(e.path || '').replace(/^\/api\//, '').split(/[/?]/)[0], 60) : null,
        path: clip(e.path, 300),
        page: clip(e.page, 300),
        status: Number.isFinite(Number(e.status)) ? Number(e.status) : null,
        code: clip(e.code, 60),
        message: clip(e.message, 1000),
        detail: clip(typeof e.detail === 'string' ? e.detail : e.detail ? JSON.stringify(e.detail) : null, 4000),
        requestId: clip(e.requestId, 120),
        shown: ['inline', 'notice', 'prompt', 'retried', 'none'].includes(e.shown) ? e.shown : null,
        userId: user?.id || null,
        visitorId: visitorId(req),
        ipHash: ipHash(req),
        country: v.country,
        device,
        lang: body.lang === 'zh' ? 'zh' : 'en',
      }))
    await insertErrors(rows)
    send(res, 200, { ok: true, n: rows.length })
  },
  { name: 'errors', limit: { hour: 300, day: 2000 } },
)

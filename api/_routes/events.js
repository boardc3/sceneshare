import { sessionUser } from '../_lib/auth.js'
import { insertEvents, visitor } from '../_lib/db.js'
import { validId } from '../_lib/gate.js'
import { readJson, route, send } from '../_lib/http.js'

// First-party product analytics: page views and actions from the browser, batched,
// no cookies. Also receives Content-Security-Policy violation reports. Visitors who
// decline analytics (or send Global Privacy Control) send nothing but errors.

const NAME = /^[a-z0-9_.:-]{1,48}$/
const ID = /^[a-z0-9]{8,40}$/

function device(ua = '') {
  if (/bot|crawl|spider|slurp|headless|lighthouse/i.test(ua)) return 'bot'
  if (/ipad|tablet/i.test(ua)) return 'tablet'
  if (/mobi|iphone|android/i.test(ua)) return 'mobile'
  return 'desktop'
}

const clip = (v, n) => (v == null ? null : String(v).slice(0, n))

function cleanProps(p) {
  if (!p || typeof p !== 'object') return null
  const s = JSON.stringify(p)
  return s.length > 4000 ? { truncated: s.slice(0, 4000) } : p
}

export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const v = visitor(req)
    const base = { country: v.country, region: v.region, device: device(v.userAgent || ''), at: new Date().toISOString() }

    // CSP reports (report-uri style or Reporting API style)
    const csp = body['csp-report'] || (Array.isArray(body) && body[0]?.type === 'csp-violation' ? body[0].body : null)
    if (csp) {
      await insertEvents([
        { ...base, name: 'csp_violation', path: clip(csp['document-uri'] || csp.documentURL, 300), propertyId: null, visitorId: null, sessionId: null, userId: null, lang: null, referrer: null,
          props: { directive: clip(csp['violated-directive'] || csp.effectiveDirective, 120), blocked: clip(csp['blocked-uri'] || csp.blockedURL, 300), sample: clip(csp['script-sample'] || csp.sample, 120) } },
      ])
      return send(res, 200, { ok: true })
    }

    const list = (Array.isArray(body.events) ? body.events : []).slice(0, 50)
    const user = await sessionUser(req, res)
    const visitorId = ID.test(body.visitorId || '') ? body.visitorId : null
    const sessionId = ID.test(body.sessionId || '') ? body.sessionId : null
    const rows = list
      .filter((e) => e && NAME.test(e.name || ''))
      .map((e) => ({
        ...base,
        at: e.at && !Number.isNaN(Date.parse(e.at)) && Math.abs(Date.now() - Date.parse(e.at)) < 864e5 ? new Date(e.at).toISOString() : base.at,
        name: e.name,
        path: clip(e.path, 300),
        propertyId: validId(e.propertyId) ? e.propertyId : null,
        visitorId,
        sessionId,
        userId: user?.id || null,
        lang: body.lang === 'zh' ? 'zh' : body.lang === 'en' ? 'en' : null,
        referrer: clip(e.referrer, 300),
        props: cleanProps(e.props),
      }))
    await insertEvents(rows)
    res._meta = { n: rows.length }
    send(res, 200, { ok: true, n: rows.length })
  },
  { name: 'events', limit: { hour: 900 } },
)

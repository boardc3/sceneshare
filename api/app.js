import account from './_routes/account.js'
import admin from './_routes/admin.js'
import applink from './_routes/applink.js'
import billing from './_routes/billing.js'
import errors from './_routes/errors.js'
import events from './_routes/events.js'
import lead from './_routes/lead.js'
import privacy from './_routes/privacy.js'
import shares from './_routes/shares.js'
import terms from './_routes/terms.js'
import { fail } from './_lib/http.js'

// Small, quick endpoints share one function (Vercel's Hobby plan allows 12 per
// deployment). vercel.json rewrites /api/<name> here as /api/app?fn=<name>.
const ROUTES = { account, admin, applink, billing, errors, events, lead, privacy, shares, terms }

export default function handler(req, res) {
  const fn = new URL(req.url, 'http://local').searchParams.get('fn') || ''
  const h = ROUTES[fn]
  if (!h) return fail(res, 404, 'not_found', 'Unknown endpoint.')
  return h(req, res)
}

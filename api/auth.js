import { authEnabled, proxyAuth } from './_lib/auth.js'
import { logRequest } from './_lib/log.js'
import { config, isTrustedOrigin } from './_lib/config.js'
import { accountsCount } from './_lib/db.js'
import { FULL_MESSAGE } from './_lib/gate.js'
import { ApiError, enforceLimit, fail } from './_lib/http.js'

// /api/auth/* → Neon Auth (vercel.json rewrites /api/auth/<path> to /api/auth?__path=<path>).
// Sign up, sign in (email + password, Google), sign out, session, verification.
export default async function handler(req, res) {
  const started = Date.now()
  const u = new URL(req.url, 'http://local')
  const path = (u.searchParams.get('__path') || u.pathname.replace(/^\/api\/auth\/?/, '')).replace(/^\/+|\/+$/g, '')
  let status = 500
  let code = null
  try {
    if (!authEnabled()) {
      status = 503
      code = 'accounts_not_configured'
      return fail(res, 503, code, 'Accounts are not set up yet.')
    }
    if (!/^[a-z0-9][a-z0-9\-/]{0,80}$/.test(path) || path.includes('..')) {
      status = 404
      code = 'not_found'
      return fail(res, 404, code, 'Unknown auth route.')
    }
    const o = req.headers?.origin
    if (req.method === 'POST' && o && o !== 'null' && !isTrustedOrigin(o)) {
      status = 403
      code = 'bad_origin'
      return fail(res, 403, code, 'This request came from another site.')
    }
    // Password guessing and sign-up floods: per IP, on top of Neon Auth's own limits.
    const guard = { 'sign-in/email': { hour: 30, day: 120 }, 'sign-up/email': { hour: 10, day: 30 }, 'forget-password': { hour: 6, day: 20 }, 'request-password-reset': { hour: 6, day: 20 } }[path]
    if (guard && req.method === 'POST') {
      try {
        await enforceLimit(req, `auth/${path}`, guard)
      } catch (e) {
        if (!(e instanceof ApiError)) throw e
        status = 429
        code = 'rate_limited'
        return fail(res, 429, code, 'Too many attempts. Wait a few minutes and try again.')
      }
    }
    // Early access: no new accounts once every spot is taken.
    if (path === 'sign-up/email' && req.method === 'POST' && config.maxAccounts && (await accountsCount()) >= config.maxAccounts) {
      status = 403
      code = 'ACCOUNTS_FULL'
      return fail(res, 403, code, FULL_MESSAGE)
    }
    status = await proxyAuth(req, res, path)
  } catch (e) {
    code = 'auth_proxy_error'
    console.error(JSON.stringify({ t: 'auth', msg: 'proxy failed', path, err: String(e?.message || e).slice(0, 300) }))
    if (!res.headersSent) fail(res, 502, code, 'Sign-in is unavailable right now. Try again in a moment.')
    status = 502
  } finally {
    logRequest(req, { route: `auth/${path.split('/').slice(0, 2).join('/')}`, status, ms: Date.now() - started, code })
  }
}

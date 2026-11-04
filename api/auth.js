import { authEnabled, proxyAuth } from './_lib/auth.js'
import { logRequest } from './_lib/log.js'
import { fail } from './_lib/http.js'

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

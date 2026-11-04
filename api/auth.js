import { authEnabled, proxyAuth } from './_lib/auth.js'
import { fail } from './_lib/http.js'

// /api/auth/* → Neon Auth (vercel.json rewrites /api/auth/<path> to /api/auth?__path=<path>).
export default async function handler(req, res) {
  const u = new URL(req.url, 'http://local')
  const path = (u.searchParams.get('__path') || u.pathname.replace(/^\/api\/auth\/?/, '')).replace(/^\/+|\/+$/g, '')
  const started = Date.now()
  try {
    if (!authEnabled()) return fail(res, 503, 'accounts_not_configured', 'Accounts are not set up yet.')
    if (!/^[a-z0-9][a-z0-9\-/]{0,80}$/.test(path) || path.includes('..')) return fail(res, 404, 'not_found', 'Unknown auth route.')
    const status = await proxyAuth(req, res, path)
    console.log(JSON.stringify({ t: 'req', route: `auth/${path}`, status, ms: Date.now() - started }))
  } catch (e) {
    console.error(JSON.stringify({ t: 'auth', msg: 'proxy failed', path, err: String(e?.message || e).slice(0, 300) }))
    if (!res.headersSent) fail(res, 502, 'auth_proxy_error', 'Sign-in is unavailable right now. Try again in a moment.')
  }
}

import { adminAnalytics, adminOverview, aiInputs, listErrors, reviewErrors, superUserDetail, superUsers } from '../_lib/db.js'
import { requireAdmin, requireSuperAdmin } from '../_lib/gate.js'
import { query, readJson, route, send } from '../_lib/http.js'

// /admin: totals, traffic, routes, errors, leads, homes, designs and privacy
// requests — for verified admin accounts only (ADMIN_EMAILS).
//   GET                                       overview
//   GET  ?errors=1&days=7&source=&level=&open=1   the error log
//   GET  ?analytics=1&days=30                      the analytics dashboard
//   GET  ?inputs=1&days=30&q=&kind=round|change     every AI input (rounds, change requests)
//   GET  ?users=1&days=30 · ?user=<id>             super admin: users, growth, one user's activity
//   POST { op: 'errors.review', ids: [..] | all: true, reviewed: true|false }
export default route(
  ['GET', 'POST'],
  async (req, res) => {
    await requireAdmin(req, res)
    if (req.method === 'POST') {
      const body = await readJson(req)
      if (body.op !== 'errors.review') return send(res, 400, { ok: false, error: 'bad_op', message: 'Unknown request.' })
      const n = await reviewErrors({ ids: body.ids, all: body.all === true, reviewed: body.reviewed !== false })
      return send(res, 200, { ok: true, n })
    }
    const q = query(req)
    // Super admin only: every user's own activity and growth.
    if (q.users === '1') {
      await requireSuperAdmin(req, res)
      return send(res, 200, { ok: true, users: await superUsers(Number(q.days) || 30) })
    }
    if (q.user) {
      await requireSuperAdmin(req, res)
      const detail = await superUserDetail(String(q.user).slice(0, 80))
      if (!detail) return send(res, 404, { ok: false, error: 'not_found', message: 'No such user.' })
      return send(res, 200, { ok: true, ...detail })
    }
    if (q.inputs === '1') return send(res, 200, { ok: true, ...(await aiInputs({ days: Number(q.days) || 30, q: q.q || '', kind: ['round', 'change'].includes(q.kind) ? q.kind : '' })) })
    if (q.analytics === '1') return send(res, 200, { ok: true, analytics: await adminAnalytics(Number(q.days) || 30), at: new Date().toISOString() })
    if (q.errors === '1') {
      const out = await listErrors({
        days: Number(q.days) || 7,
        source: ['server', 'api', 'browser'].includes(q.source) ? q.source : null,
        level: ['error', 'warning'].includes(q.level) ? q.level : null,
        open: q.open === '1',
      })
      return send(res, 200, { ok: true, ...out })
    }
    send(res, 200, { ok: true, overview: await adminOverview(), at: new Date().toISOString() })
  },
  { name: 'admin' },
)

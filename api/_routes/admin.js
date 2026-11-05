import { adminOverview, listErrors, reviewErrors } from '../_lib/db.js'
import { requireAdmin } from '../_lib/gate.js'
import { query, readJson, route, send } from '../_lib/http.js'

// /admin: totals, traffic, routes, errors, leads, homes, designs and privacy
// requests — for verified admin accounts only (ADMIN_EMAILS).
//   GET                                       overview
//   GET  ?errors=1&days=7&source=&level=&open=1   the error log
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

import { adminOverview } from '../_lib/db.js'
import { requireAdmin } from '../_lib/gate.js'
import { route, send } from '../_lib/http.js'

// /admin: totals, traffic, routes, errors, leads, homes, designs and privacy
// requests — for verified admin accounts only (ADMIN_EMAILS).
export default route(
  ['GET'],
  async (req, res) => {
    await requireAdmin(req, res)
    send(res, 200, { ok: true, overview: await adminOverview(), at: new Date().toISOString() })
  },
  { name: 'admin' },
)

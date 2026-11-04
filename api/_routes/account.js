import { authCall, authEnabled, sessionUser } from '../_lib/auth.js'
import { addPrivacyRequest, deleteAuthUser, deleteUserData, exportUser, logSubmission, setPrefs, touchUser } from '../_lib/db.js'
import { isAdmin, newId, requireUser } from '../_lib/gate.js'
import { ApiError, query, readJson, route, send } from '../_lib/http.js'

// GET              who is signed in (and moves homes saved under their verified email into the account)
// GET ?export=1    "Download my data": everything we hold about the account, as JSON
// POST {op:'delete', confirm:'DELETE'}   delete the account and everything it made
export default route(
  ['GET', 'POST'],
  async (req, res) => {
    if (req.method === 'GET') {
      const q = query(req)
      if (q.export === '1') {
        const user = await requireUser(req, res)
        const data = await exportUser(user)
        await logSubmission({ user, kind: 'data_export' })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Content-Disposition', `attachment; filename="sceneshare-data-${new Date().toISOString().slice(0, 10)}.json"`)
        res.setHeader('Cache-Control', 'no-store')
        return res.end(JSON.stringify(data, null, 2))
      }
      const user = authEnabled() ? await sessionUser(req, res) : null
      if (!user) return send(res, 200, { ok: true, accounts: authEnabled(), user: null })
      const { claimed, prefs } = await touchUser(user)
      res._meta = claimed ? { claimed } : null
      return send(res, 200, { ok: true, accounts: true, user, admin: isAdmin(user), claimed, prefs })
    }

    const body = await readJson(req)
    if (body.op === 'prefs') {
      const u = await requireUser(req, res)
      const prefs = await setPrefs(u.id, body.prefs)
      res._meta = { prefs }
      return send(res, 200, { ok: true, prefs })
    }
    if (body.op !== 'delete') throw new ApiError(400, 'bad_op', 'Unknown request.')
    const user = await requireUser(req, res)
    if (body.confirm !== 'DELETE') throw new ApiError(400, 'confirm_required', 'Type DELETE to confirm.')
    const removed = await deleteUserData(user)
    // The sign-in record itself lives in Neon Auth.
    let r = await authCall(req, res, 'delete-user', { body: {} }).catch((e) => ({ ok: false, status: 0, data: { message: e.message } }))
    if (!r.ok) {
      // Neon Auth's delete-user endpoint is off by default: remove the record directly.
      const direct = await deleteAuthUser(user.id).catch((e) => {
        console.error(JSON.stringify({ t: 'account', msg: 'direct auth delete failed', err: e.message }))
        return false
      })
      if (direct) r = { ok: true, status: 200, data: { direct: true } }
    }
    if (!r.ok) {
      // Finish by hand (see /admin) rather than leave a half-deleted account unrecorded.
      await addPrivacyRequest({ id: newId(10), kind: 'delete_sign_in', email: user.email, userId: user.id, details: 'Data deleted automatically; remove the sign-in record in Neon Auth.', meta: { status: r.status, upstream: r.data } })
    }
    res._meta = { properties: removed.properties, authDeleted: r.ok }
    console.log(JSON.stringify({ t: 'account', msg: 'deleted', userId: user.id, properties: removed.properties, authDeleted: r.ok }))
    send(res, 200, { ok: true, deleted: true, properties: removed.properties, signInRemoved: r.ok })
  },
  { name: 'account', limit: { hour: 600 } },
)

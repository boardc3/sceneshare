import { authCall, authEnabled, sessionUser } from '../_lib/auth.js'
import { cancelForDeletion } from '../_lib/billing.js'
import { TERMS_VERSION } from '../_lib/config.js'
import { acceptTerms, addPrivacyRequest, deleteAuthUser, deleteUserData, exportUser, logSubmission, setPrefs, touchUser } from '../_lib/db.js'
import { background, ipHash } from '../_lib/log.js'
import { removeImages } from '../_lib/storage.js'
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
      const { claimed, prefs, termsAt, termsVersion } = await touchUser(user)
      res._meta = claimed ? { claimed } : null
      const terms = { accepted: Boolean(termsAt && termsVersion === TERMS_VERSION), at: termsAt, version: TERMS_VERSION }
      return send(res, 200, { ok: true, accounts: true, user, admin: isAdmin(user), claimed, prefs, terms })
    }

    const body = await readJson(req)
    if (body.op === 'prefs') {
      const u = await requireUser(req, res)
      const prefs = await setPrefs(u.id, body.prefs)
      res._meta = { prefs }
      return send(res, 200, { ok: true, prefs })
    }
    // Accept the Terms of Service (once per account, before sharing). Recorded with
    // the version, time, hashed IP and browser, in terms_acceptances.
    if (body.op === 'terms') {
      const u = await requireUser(req, res)
      if (body.accept !== true || body.rights !== true) throw new ApiError(400, 'confirm_required', 'Confirm you have the right to share, and accept the Terms.')
      const at = await acceptTerms({ user: u, version: TERMS_VERSION, ipHash: ipHash(req), userAgent: req.headers['user-agent'], context: String(body.context || '').slice(0, 40) || null })
      await logSubmission({ user: u, kind: 'terms_accept', meta: { version: TERMS_VERSION, context: body.context || null } })
      res._meta = { version: TERMS_VERSION }
      return send(res, 200, { ok: true, terms: { accepted: true, at, version: TERMS_VERSION } })
    }
    if (body.op !== 'delete') throw new ApiError(400, 'bad_op', 'Unknown request.')
    const user = await requireUser(req, res)
    if (body.confirm !== 'DELETE') throw new ApiError(400, 'confirm_required', 'Type DELETE to confirm.')
    // A paid subscription stops before the account goes, so no further charges.
    const canceled = await cancelForDeletion(user).catch((e) => {
      console.error(JSON.stringify({ t: 'account', msg: 'subscription cancel failed', err: e.message }))
      throw new ApiError(502, 'subscription_cancel_failed', 'We could not cancel your subscription just now, so your account was not deleted. Please try again.')
    })
    const removed = await deleteUserData(user)
    background(removeImages(removed.files || []).catch(() => {}))
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
    res._meta = { properties: removed.properties, authDeleted: r.ok, subscriptionCanceled: canceled }
    console.log(JSON.stringify({ t: 'account', msg: 'deleted', userId: user.id, properties: removed.properties, authDeleted: r.ok }))
    send(res, 200, { ok: true, deleted: true, properties: removed.properties, signInRemoved: r.ok })
  },
  { name: 'account', limit: { hour: 600 } },
)

import { originOf } from '../_lib/auth.js'
import { config, TERMS_VERSION } from '../_lib/config.js'
import { addTermsRequest, ownerAccepted, propertyRow, recentTermsEmails } from '../_lib/db.js'
import { newId, validId } from '../_lib/gate.js'
import { ApiError, isEmail, readJson, route, send } from '../_lib/http.js'
import { ipHash, visitorId } from '../_lib/log.js'
import { sendTermsRequestEmail } from '../_lib/mail.js'

// POST { propertyId, email?, s? } — from a home that isn't visible yet because its
// owner hasn't accepted the Terms: "Click to email <owner>". Every click is stored
// in terms_requests; the owner gets at most one email an hour per home.
export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    if (!validId(body.propertyId)) throw new ApiError(400, 'bad_property', 'That home link is not valid.')
    const row = await propertyRow(body.propertyId)
    if (!row) throw new ApiError(404, 'not_found', 'This home is no longer shared.')
    if (ownerAccepted(row, TERMS_VERSION)) return send(res, 200, { ok: true, already: true })
    const to = row.owner_account_email || row.owner_email
    const requesterEmail = isEmail(String(body.email || '').trim()) ? String(body.email).trim().toLowerCase() : null
    const throttled = (await recentTermsEmails(row.id)) > 0
    let emailed = false
    if (to && !throttled && config.mailKey && config.mailFrom) {
      const address = row.data?.address?.formatted || ''
      emailed = await sendTermsRequestEmail({ to, ownerName: row.owner_name, address, acceptUrl: `${originOf(req)}/studio/${row.id}?accept=terms`, requesterEmail })
    }
    await addTermsRequest({ id: newId(12), propertyId: row.id, ownerUserId: row.owner_user_id, ownerEmail: to, requesterEmail, visitorId: visitorId(req), ipHash: ipHash(req), shareId: /^[a-z0-9]{10}$/.test(body.s || '') ? body.s : null, emailed })
    res._meta = { propertyId: row.id, emailed, throttled, requester: Boolean(requesterEmail) }
    // Already emailed within the hour: the owner has been asked; tell the visitor so.
    send(res, 200, { ok: true, emailed: emailed || throttled })
  },
  { name: 'terms', limit: { hour: 20, day: 60 } },
)

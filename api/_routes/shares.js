import { sessionUser } from '../_lib/auth.js'
import { config } from '../_lib/config.js'
import { createShare, listShares, logSubmission, markShareSent, propertyRow } from '../_lib/db.js'
import { newId, requireOwner, validId } from '../_lib/gate.js'
import { ApiError, isEmail, query, readJson, route, send } from '../_lib/http.js'
import { visitorId } from '../_lib/log.js'
import { sendShareEmail } from '../_lib/mail.js'

// Every share of a home gets its own tracked link (/p/<id>?s=<share>), so the
// owner sees how many times the home was shared — by email, text, copied link or
// the phone's share sheet — and how many times each share was opened.
//   POST { propertyId, channel, recipients?, name?, message?, lang }   → { id, url, sent }
//   GET  ?propertyId=…   (owner) → every share with its opens, and totals
const CHANNELS = ['email', 'copy', 'text', 'native']

export default route(
  ['GET', 'POST'],
  async (req, res) => {
    if (req.method === 'GET') {
      const { propertyId } = query(req)
      await requireOwner(req, res, propertyId)
      return send(res, 200, { ok: true, ...(await listShares(propertyId)) })
    }

    const body = await readJson(req)
    if (!validId(body.propertyId)) throw new ApiError(400, 'bad_property', 'That home link is not valid.')
    const row = await propertyRow(body.propertyId)
    if (!row) throw new ApiError(404, 'not_found', 'This home is no longer shared.')
    const channel = CHANNELS.includes(body.channel) ? body.channel : 'copy'
    const recipients = channel === 'email' ? [...new Set(String(body.recipients || '').split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean))] : []
    if (channel === 'email') {
      if (!recipients.length) throw new ApiError(400, 'recipients_required', 'Add at least one email address.')
      if (recipients.length > 10) throw new ApiError(400, 'too_many_recipients', 'Send to at most 10 people at a time.')
      const bad = recipients.find((r) => !isEmail(r))
      if (bad) throw new ApiError(400, 'bad_recipient', `“${bad.slice(0, 60)}” isn’t a valid email address.`)
    }
    const user = await sessionUser(req, res)
    const byOwner = Boolean(user && row.owner_user_id === user.id)
    const lang = body.lang === 'zh' ? 'zh' : 'en'
    // The browser may propose the id, so a copied or texted link works instantly.
    const id = /^[a-z0-9]{10}$/.test(body.id || '') ? body.id : newId(10)
    const origin = (req.headers['x-forwarded-proto'] ? `${String(req.headers['x-forwarded-proto']).split(',')[0]}://` : 'https://') + String(req.headers['x-forwarded-host'] || req.headers.host || '')
    const url = `${origin}/p/${row.id}?s=${id}${lang === 'zh' ? '&lang=zh' : ''}`
    const senderName = String(body.name || user?.name || '').trim().slice(0, 80) || null
    const message = String(body.message || '').trim().slice(0, 2000) || null

    await createShare({ id, propertyId: row.id, userId: user?.id || null, byOwner, channel, recipients, senderName, message, lang, visitorId: visitorId(req), sent: false })

    // Sent by us when an email service is configured; otherwise the browser opens
    // the sender's own mail app with the tracked link filled in.
    let sent = false
    if (channel === 'email' && body.send !== false && config.mailKey && config.mailFrom) {
      sent = await sendShareEmail({ to: recipients, replyTo: user?.email || null, senderName, message, url, address: row.data?.address?.formatted || '', lang })
      if (sent) await markShareSent(id)
    }

    await logSubmission({ user, kind: 'share', propertyId: row.id, lang, address: row.data?.address?.formatted || null, meta: { shareId: id, channel, recipients: recipients.length, byOwner, sent } })
    res._meta = { propertyId: row.id, shareId: id, channel, recipients: recipients.length, sent }
    send(res, 200, { ok: true, id, url, sent })
  },
  { name: 'shares', limit: { hour: 60, day: 300 } },
)

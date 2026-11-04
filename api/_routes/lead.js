import { sessionUser } from '../_lib/auth.js'
import { captureLead } from '../_lib/db.js'
import { validId } from '../_lib/gate.js'
import { ApiError, isEmail, readJson, route, send } from '../_lib/http.js'

// The once-per-session email prompt (buyers on a share page: "get updates on this
// home") posts here. Signed-in owners are never asked.
export default route(
  ['POST'],
  async (req, res) => {
    const { email, lang = 'en', context = null, propertyId = null, consent = false } = await readJson(req)
    if (!isEmail(email)) throw new ApiError(400, 'bad_email', 'Enter a valid email address.')
    if (!consent) throw new ApiError(400, 'consent_required', 'Please confirm you’d like us to email you.')
    const user = await sessionUser(req, res)
    const pid = validId(propertyId) ? propertyId : null
    const stored = await captureLead({
      email,
      lang: lang === 'zh' ? 'zh' : 'en',
      context: context ? String(context).slice(0, 60) : null,
      source: pid ? 'buyer' : 'visitor',
      propertyId: pid,
      userId: user?.id || null,
      req,
    })
    res._meta = { propertyId: pid, context }
    send(res, 200, { ok: true, stored: Boolean(stored) })
  },
  { name: 'lead', limit: { hour: 20, day: 60 } },
)

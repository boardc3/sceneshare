import { sessionUser } from '../_lib/auth.js'
import { addPrivacyRequest } from '../_lib/db.js'
import { newId } from '../_lib/gate.js'
import { ApiError, isEmail, readJson, route, send } from '../_lib/http.js'

// California privacy requests (CCPA/CPRA): know/access, delete, correct, opt out,
// limit. Signed-in owners can export and delete their data themselves on the
// account page; this form covers everyone else (buyers, people who emailed us).
const KINDS = ['access', 'delete', 'correct', 'opt_out', 'limit', 'other']

export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const kind = KINDS.includes(body.kind) ? body.kind : null
    if (!kind) throw new ApiError(400, 'bad_kind', 'Choose the kind of request.')
    if (!isEmail(body.email)) throw new ApiError(400, 'bad_email', 'Enter the email address the request is about.')
    const user = await sessionUser(req, res)
    const id = newId(10)
    const ok = await addPrivacyRequest({
      id,
      kind,
      email: String(body.email).trim().toLowerCase(),
      userId: user?.id || null,
      details: String(body.details || '').slice(0, 2000) || null,
      meta: { agent: Boolean(body.agent), name: String(body.name || '').slice(0, 120) || null, lang: body.lang === 'zh' ? 'zh' : 'en' },
    })
    if (!ok) throw new ApiError(503, 'privacy_unavailable', 'We could not record your request. Please email us instead.')
    console.log(JSON.stringify({ t: 'privacy', msg: 'request', id, kind }))
    res._meta = { id, kind }
    send(res, 200, { ok: true, id })
  },
  { name: 'privacy', limit: { hour: 10, day: 30 } },
)

import { logSubmission } from './_lib/db.js'
import { fail, isEmail, readJson, route, send } from './_lib/http.js'

// The email gate posts here once, before the first submission of a session.
export default route(['POST'], async (req, res) => {
  const { email, lang = 'en', context = null } = await readJson(req)
  if (!isEmail(email)) return fail(res, 400, 'bad_email', 'Enter a valid email address.')
  const stored = await logSubmission({ email, kind: 'email_capture', lang, meta: context ? { context } : null })
  send(res, 200, { ok: true, stored })
})

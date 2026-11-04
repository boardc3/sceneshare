import { ApiError, isEmail } from './http.js'

// "There should be an email capture upon any submission": every endpoint that
// does work for the visitor requires the captured email and logs against it.
export function requireEmail(body) {
  const email = (body?.email || '').trim()
  if (!isEmail(email)) throw new ApiError(401, 'email_required', 'Enter your email to continue.')
  return email.toLowerCase()
}

export const newId = (len = 10) => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => a[b % a.length]).join('')
}

import { authEnabled, sessionUser } from './auth.js'
import { config } from './config.js'
import { propertyRow } from './db.js'
import { ApiError, isEmail } from './http.js'

// Owners act signed in (Chris, 2026-11-04: "The user must be logged in to search
// properties; it should then save the property to that user for their list").
// Buyers opening a share link never need an account.

export async function requireUser(req, res) {
  if (!authEnabled()) throw new ApiError(503, 'accounts_not_configured', 'Accounts are not set up yet.')
  const user = await sessionUser(req, res)
  if (!user) throw new ApiError(401, 'sign_in_required', 'Sign in to continue.')
  return user
}

export const isAdmin = (user) => Boolean(user?.emailVerified && config.adminEmails.includes(user.email))

export const isSuperAdmin = (user) => Boolean(user?.emailVerified && config.superAdminEmails.includes(user.email))
export async function requireSuperAdmin(req, res) {
  const user = await requireUser(req, res)
  if (!isSuperAdmin(user)) throw new ApiError(403, 'not_super_admin', 'This view is for the Sceneshare super admin.')
  return user
}

export async function requireAdmin(req, res) {
  const user = await requireUser(req, res)
  if (!isAdmin(user)) throw new ApiError(403, 'not_admin', 'This page is for Sceneshare administrators.')
  return user
}

export const validId = (id) => /^[a-z0-9]{6,20}$/.test(id || '')

// The signed-in owner of a home. Homes saved under an email before accounts
// existed move to the account whose verified email matches (see touchUser).
export async function requireOwner(req, res, propertyId) {
  const user = await requireUser(req, res)
  if (!validId(propertyId)) throw new ApiError(400, 'bad_property', 'That property link is not valid.')
  const row = await propertyRow(propertyId)
  if (!row) throw new ApiError(404, 'not_found', 'This property no longer exists.')
  const legacyMatch = !row.owner_user_id && user.emailVerified && row.owner_email && row.owner_email.toLowerCase() === user.email
  if (row.owner_user_id !== user.id && !legacyMatch) throw new ApiError(403, 'not_owner', 'Only the account that saved this home can change it.')
  return { user, row }
}

export function optionalEmail(body) {
  const email = String(body?.email || '').trim()
  return isEmail(email) ? email.toLowerCase() : null
}

export const newId = (len = 10) => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(len))
  return Array.from(bytes, (b) => a[b % a.length]).join('')
}

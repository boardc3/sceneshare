// Accounts in the browser. Every call goes to /api/auth/* (our proxy to Neon
// Auth), so the session is a first-party HttpOnly cookie the page never touches.
import { useSyncExternalStore } from 'react'
import { track } from './analytics.js'
import { get, post, setAuthRecovery } from './api.js'
import { clearBilling, loadBilling } from './billing.js'

const state = { ready: false, user: null, admin: false, superAdmin: false, accounts: true, claimed: 0, prefs: {}, terms: { accepted: false } }
let snapshot = { ...state }
const subs = new Set()
function set(patch) {
  Object.assign(state, patch)
  snapshot = { ...state }
  subs.forEach((fn) => fn())
}
export const useAuth = () =>
  useSyncExternalStore(
    (fn) => (subs.add(fn), () => subs.delete(fn)),
    () => snapshot,
  )
export const currentUser = () => state.user

const VERIFIER = 'neon_auth_session_verifier'

// Load the session (and finish a Google sign-in when we come back with a verifier).
export async function refresh() {
  const url = new URL(window.location.href)
  const verifier = url.searchParams.get(VERIFIER)
  if (verifier) {
    try {
      await fetch(`/api/auth/get-session?${VERIFIER}=${encodeURIComponent(verifier)}`, { credentials: 'same-origin' })
    } catch {
      /* the account call below reports the outcome */
    }
    url.searchParams.delete(VERIFIER)
    window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  }
  try {
    const d = await get('/api/account')
    set({ ready: true, user: d.user, admin: !!d.admin, superAdmin: !!d.superAdmin, accounts: d.accounts !== false, claimed: d.claimed || 0, prefs: d.prefs || {}, terms: d.terms || { accepted: false }, full: d.accountsFull ? d.message || true : false })
    if (d.user) loadBilling()
    else clearBilling()
    if (verifier && d.user) track('sign_in', { method: 'google' })
    if (verifier && !d.user) track('sign_in_failed', { method: 'google' })
  } catch {
    set({ ready: true })
  }
  return state.user
}

async function call(path, body) {
  let r
  try {
    r = await fetch(`/api/auth/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body || {}) })
  } catch {
    return { error: { code: 'network' } }
  }
  let data = null
  try {
    data = await r.json()
  } catch {
    /* empty body */
  }
  if (!r.ok) return { error: { code: data?.code || data?.error || `http_${r.status}`, message: data?.message || '' } }
  return { data }
}

export async function signUpEmail({ name, email, password }) {
  const r = await call('sign-up/email', { name: name || email.split('@')[0], email, password })
  if (!r.error) {
    track('sign_up', { method: 'email' })
    await refresh()
  }
  return r
}

export async function signInEmail({ email, password }) {
  const r = await call('sign-in/email', { email, password })
  if (!r.error) {
    track('sign_in', { method: 'email' })
    await refresh()
  }
  return r
}

// Full-page redirect to Google; we come back to `returnTo` with a verifier.
export async function signInGoogle(returnTo = window.location.pathname + window.location.search) {
  track('sign_in_start', { method: 'google' })
  const r = await call('sign-in/social', { provider: 'google', callbackURL: new URL(returnTo, window.location.origin).toString() })
  if (r.data?.url) {
    window.location.assign(r.data.url)
    return { redirecting: true }
  }
  return r.error ? r : { error: { code: 'google_unavailable' } }
}

// Account preferences (language, share-link language, email choices).
export async function savePrefs(patch) {
  if (!state.user) return state.prefs
  set({ prefs: { ...state.prefs, ...patch } })
  try {
    const d = await post('/api/account', { op: 'prefs', prefs: patch })
    set({ prefs: d.prefs })
  } catch {
    /* kept locally; next save retries */
  }
  return state.prefs
}

export const updateName = async (name) => {
  const r = await call('update-user', { name })
  if (!r.error) await refresh()
  return r
}
export const changePassword = (currentPassword, newPassword, revokeOtherSessions = true) => call('change-password', { currentPassword, newPassword, revokeOtherSessions })
export const signOutOthers = () => call('revoke-other-sessions', {})

export async function signOut() {
  await call('sign-out', {})
  track('sign_out')
  set({ user: null, admin: false, superAdmin: false, claimed: 0, terms: { accepted: false } })
  clearBilling()
}

export const sendVerifyCode = (email) => call('email-otp/send-verification-otp', { email, type: 'email-verification' })
export async function verifyEmail(email, otp) {
  const r = await call('email-otp/verify-email', { email, otp })
  if (!r.error) {
    track('email_verified')
    await refresh()
  }
  return r
}
export const requestReset = (email) => call('request-password-reset', { email, redirectTo: `${window.location.origin}/reset` })
export const resetPassword = (token, newPassword) => call('reset-password', { token, newPassword })

// ---- the sign-in dialog, opened from anywhere: await requireSignIn(...)
let opener = null
export const onAuthRequest = (fn) => ((opener = fn), () => opener === fn && (opener = null))

// What to do after signing in, kept across the Google redirect.
const INTENT = 'ss:intent'
export function saveIntent(intent) {
  try {
    sessionStorage.setItem(INTENT, JSON.stringify({ ...intent, at: Date.now() }))
  } catch {
    /* private mode */
  }
}
export function takeIntent() {
  try {
    const raw = sessionStorage.getItem(INTENT)
    sessionStorage.removeItem(INTENT)
    const v = raw ? JSON.parse(raw) : null
    return v && Date.now() - v.at < 30 * 60000 ? v : null
  } catch {
    return null
  }
}

export function openAuth({ mode = 'signin', reason = null, intent = null } = {}) {
  if (intent) saveIntent(intent)
  if (!opener) return Promise.resolve(null)
  return new Promise((resolve) => opener({ mode, reason, resolve }))
}

// When a session ends mid-task, ask to sign in again and carry on.
setAuthRecovery(async () => {
  set({ user: null })
  const user = await openAuth({ mode: 'signin', reason: 'expired' })
  return Boolean(user)
})

export async function requireSignIn(reason, intent = null) {
  if (state.user) return state.user
  if (!state.ready) await refresh()
  if (state.user) return state.user
  const user = await openAuth({ mode: 'signup', reason, intent })
  if (user) takeIntent() // finished here, no redirect: the caller carries on itself
  return user
}

// ---- Terms of Service, accepted once per account before sharing.
export async function acceptTerms(context = 'share') {
  const d = await post('/api/account', { op: 'terms', accept: true, rights: true, context })
  set({ terms: d.terms })
  track('terms_accept', { context })
  return d.terms
}

let termsOpener = null
export const onTermsRequest = (fn) => ((termsOpener = fn), () => termsOpener === fn && (termsOpener = null))

// Resolves true once the account has accepted (asking now if needed), false if declined.
export async function ensureTerms(context = 'share') {
  if (state.terms?.accepted) return true
  if (!state.user) {
    const u = await requireSignIn('share')
    if (!u) return false
    if (state.terms?.accepted) return true
  }
  if (!termsOpener) return false
  return new Promise((resolve) => termsOpener({ context, resolve }))
}

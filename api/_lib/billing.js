import crypto from 'node:crypto'
import { billingState, config } from './config.js'
import { getBillingRow, recordBillingEvent, setBilling, usageFor } from './db.js'
import { isAdmin } from './gate.js'
import { ApiError } from './http.js'

// Plans (Sceneshare business plan, 2026-11-04): Free and Pro at $50/month or
// $500/year. Limits are checked on the server; the browser only displays them.
export const PLANS = {
  free: { homes: 1, designsPerHome: 2, emailsPerHome: 5, runs30d: null },
  pro: { homes: null, designsPerHome: null, emailsPerHome: null, runs30d: 40 }, // fair use
}
export const PRICES = { month: { amount: 5000, currency: 'usd' }, year: { amount: 50000, currency: 'usd' } }
const PREVIEW_DAYS = { month: 30, year: 365 }
// A failed renewal keeps Pro this long while Stripe retries the card.
const GRACE_MS = 3 * 864e5
const ACTIVE = ['active', 'trialing', 'past_due']

// ---------------------------------------------------------------- entitlement

// The plan an account is on right now, from its stored subscription.
export function entitlement(row, user = null) {
  const mode = billingState()
  const now = Date.now()
  const end = row?.period_end ? new Date(row.period_end).getTime() : null
  const base = {
    mode,
    plan: 'free',
    source: row?.plan_source || null,
    status: row?.plan_status || null,
    interval: row?.plan_interval || null,
    periodEnd: end ? new Date(end).toISOString() : null,
    daysLeft: end ? Math.max(0, Math.ceil((end - now) / 864e5)) : null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    canManage: Boolean(row?.stripe_customer_id) && (mode === 'test' || mode === 'live'),
  }
  if (mode === 'off') return { ...base, plan: 'pro', source: 'off', unlimited: true }
  if (user && isAdmin(user) && row?.plan !== 'pro') return { ...base, plan: 'pro', source: 'admin', daysLeft: null, periodEnd: null }
  const paid = row?.plan === 'pro' && ACTIVE.includes(row?.plan_status || '') && end && end + GRACE_MS > now
  // A preview upgrade means nothing once real billing is on, and the reverse.
  const sourceMatches = row?.plan_source === 'preview' ? mode === 'preview' : row?.plan_source === 'stripe' ? mode === 'test' || mode === 'live' : row?.plan_source === 'comp'
  return { ...base, plan: paid && sourceMatches ? 'pro' : 'free' }
}

export async function billingFor(user, propertyId = null) {
  const row = await getBillingRow(user.id)
  const ent = entitlement(row, user)
  const limits = PLANS[ent.plan]
  const usage = await usageFor(user.id, propertyId)
  return { ...ent, limits: ent.unlimited ? PLANS.pro : limits, usage }
}

// ---------------------------------------------------------------- limit checks

function limitError(kind, limit, ent) {
  const msg = {
    homes: `The Free plan includes ${limit} home. Upgrade to Pro for unlimited homes.`,
    designs: `The Free plan includes ${limit} designs per home. Upgrade to Pro for unlimited designs.`,
    emails: `The Free plan includes ${limit} emailed shares per home. Upgrade to Pro, or copy the link instead.`,
    runs: `You’ve restyled ${limit} houses in the last 30 days, Pro’s fair-use limit. Contact us and we’ll lift it.`,
  }[kind]
  return new ApiError(402, 'plan_limit', msg, { limit: kind, max: limit, plan: ent.plan })
}

export async function assertCanAddHome(user) {
  const b = await billingFor(user)
  if (b.limits.homes != null && b.usage.homes >= b.limits.homes) throw limitError('homes', b.limits.homes, b)
  return b
}

export async function assertCanAddDesign(user, propertyId, { photoOnly = false } = {}) {
  const b = await billingFor(user, propertyId)
  if (!photoOnly && b.limits.designsPerHome != null && b.usage.designs >= b.limits.designsPerHome) throw limitError('designs', b.limits.designsPerHome, b)
  if (b.limits.runs30d != null && b.usage.runs30d >= b.limits.runs30d) throw limitError('runs', b.limits.runs30d, b)
  return b
}

export async function assertCanEmail(user, propertyId, count) {
  const b = await billingFor(user, propertyId)
  if (b.limits.emailsPerHome != null && b.usage.emails + count > b.limits.emailsPerHome) {
    const left = Math.max(0, b.limits.emailsPerHome - b.usage.emails)
    const err = limitError('emails', b.limits.emailsPerHome, b)
    err.extra.left = left
    throw err
  }
  return b
}

// ---------------------------------------------------------------- preview mode
// Lets the whole upgrade → Pro → cancel → expire cycle run with no money moving.

export async function previewSubscribe(user, interval) {
  const days = PREVIEW_DAYS[interval] || 30
  const row = await setBilling(user.id, {
    plan: 'pro',
    status: 'active',
    source: 'preview',
    interval,
    periodEnd: new Date(Date.now() + days * 864e5).toISOString(),
    cancelAtPeriodEnd: false,
  })
  await recordBillingEvent({ id: `prev_${crypto.randomUUID()}`, source: 'preview', type: 'subscribe', userId: user.id, data: { interval, days } })
  return row
}

export async function previewSetCancel(user, cancel) {
  const row = await getBillingRow(user.id)
  if (row?.plan_source !== 'preview' || row?.plan !== 'pro') throw new ApiError(400, 'no_subscription', 'There is no subscription to change.')
  const out = await setBilling(user.id, { cancelAtPeriodEnd: cancel })
  await recordBillingEvent({ id: `prev_${crypto.randomUUID()}`, source: 'preview', type: cancel ? 'cancel' : 'resume', userId: user.id })
  return out
}

// ---------------------------------------------------------------- Stripe (REST, no SDK)

function form(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    const key = prefix ? `${prefix}[${k}]` : k
    if (typeof v === 'object') form(v, key, out)
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`)
  }
  return out
}

export async function stripe(method, path, params = null, { idempotencyKey = null } = {}) {
  if (!config.stripeKey) throw new ApiError(503, 'billing_not_configured', 'Payments are not set up yet.')
  const url = `https://api.stripe.com/v1/${path}${method === 'GET' && params ? `?${form(params).join('&')}` : ''}`
  const headers = { Authorization: `Bearer ${config.stripeKey}`, 'Stripe-Version': '2024-06-20' }
  if (method !== 'GET') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey
  const started = Date.now()
  const r = await fetch(url, { method, headers, body: method !== 'GET' && params ? form(params).join('&') : undefined, signal: AbortSignal.timeout(15000) })
  const data = await r.json().catch(() => ({}))
  console.log(JSON.stringify({ t: 'stripe', method, path: path.replace(/\/(cus|sub|cs|bps)_[A-Za-z0-9]+/g, '/$1_…'), status: r.status, ms: Date.now() - started }))
  if (!r.ok) {
    console.error(JSON.stringify({ t: 'stripe', msg: 'error', path, status: r.status, type: data?.error?.type, code: data?.error?.code, message: data?.error?.message }))
    throw new ApiError(502, 'payment_provider_error', 'The payment service did not respond as expected. Please try again in a moment.')
  }
  return data
}

async function customerFor(user, row) {
  if (row?.stripe_customer_id) return row.stripe_customer_id
  const c = await stripe('POST', 'customers', { email: user.email, name: user.name || undefined, metadata: { userId: user.id } }, { idempotencyKey: `cus_${user.id}` })
  await setBilling(user.id, { customerId: c.id })
  return c.id
}

const lineItem = (interval) => {
  const price = interval === 'year' ? config.stripePriceYearly : config.stripePriceMonthly
  if (price) return { price, quantity: 1 }
  // No price set up in Stripe yet: describe it inline.
  return { quantity: 1, price_data: { currency: 'usd', unit_amount: PRICES[interval].amount, recurring: { interval }, product_data: { name: 'Sceneshare Pro' } } }
}

export async function checkoutSession(user, interval, origin) {
  const row = await getBillingRow(user.id)
  const customer = await customerFor(user, row)
  const s = await stripe('POST', 'checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items: { 0: lineItem(interval) },
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    subscription_data: { metadata: { userId: user.id } },
    metadata: { userId: user.id, interval },
    success_url: `${origin}/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plan?checkout=cancel`,
  })
  await recordBillingEvent({ id: `co_${s.id}`, source: 'stripe', type: 'checkout_started', userId: user.id, data: { interval, session: s.id } })
  return s.url
}

export async function portalSession(user, origin) {
  const row = await getBillingRow(user.id)
  if (!row?.stripe_customer_id) throw new ApiError(400, 'no_subscription', 'There is no subscription to manage yet.')
  const s = await stripe('POST', 'billing_portal/sessions', { customer: row.stripe_customer_id, return_url: `${origin}/plan` })
  return s.url
}

// Copy a Stripe subscription onto the account.
export async function applySubscription(userId, sub) {
  const item = sub?.items?.data?.[0]
  const periodEnd = sub.current_period_end || item?.current_period_end || null
  const live = ACTIVE.includes(sub.status)
  return setBilling(userId, {
    plan: live ? 'pro' : 'free',
    status: sub.status,
    source: 'stripe',
    interval: item?.price?.recurring?.interval || null,
    periodEnd: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
    customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
    subscriptionId: sub.id,
  })
}

// After Checkout returns (and whenever the plan page opens), read the latest
// subscription straight from Stripe, so the account is right even if a webhook is late.
export async function syncFromStripe(user) {
  const row = await getBillingRow(user.id)
  if (!row?.stripe_customer_id) return row
  const list = await stripe('GET', 'subscriptions', { customer: row.stripe_customer_id, status: 'all', limit: 5 })
  const subs = (list.data || []).sort((a, b) => (ACTIVE.includes(b.status) - ACTIVE.includes(a.status)) || b.created - a.created)
  if (!subs[0]) return row
  return applySubscription(user.id, subs[0])
}

// When an account is deleted, stop its subscription at once.
export async function cancelForDeletion(user) {
  const row = await getBillingRow(user.id)
  if (!row?.stripe_subscription_id || !config.stripeKey || !ACTIVE.includes(row.plan_status || '')) return false
  await stripe('DELETE', `subscriptions/${row.stripe_subscription_id}`)
  await recordBillingEvent({ id: `del_${row.stripe_subscription_id}`, source: 'stripe', type: 'canceled_account_deleted', userId: user.id })
  return true
}

// Stripe-Signature: t=…,v1=… — HMAC-SHA256 of "t.body" with the endpoint secret.
export function verifyWebhook(raw, header, secret = config.stripeWebhookSecret, toleranceSec = 300) {
  if (!secret || !header) return false
  const parts = Object.fromEntries(String(header).split(',').map((p) => p.split('=')).filter((p) => p.length === 2).map(([k, v]) => [k.trim(), v.trim()]))
  const sigs = String(header).split(',').filter((p) => p.trim().startsWith('v1=')).map((p) => p.trim().slice(3))
  const t = Number(parts.t)
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex')
  return sigs.some((s) => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)))
}

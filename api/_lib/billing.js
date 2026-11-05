import crypto from 'node:crypto'
import { billingState, config } from './config.js'
import { addCredits, creditBalance, debitCredit, getBillingRow, recordBillingEvent, refundCredit, setBilling, usageFor } from './db.js'
import { isAdmin } from './gate.js'
import { ApiError } from './http.js'

// Plans (Sceneshare business plan, 2026-11-04): Free and Pro at $50/month or
// $500/year. Limits are checked on the server; the browser only displays them.
// Every rendered image (a restyle, a clean-up or a change request) costs one
// credit; a take the alignment check throws away and refires is on us. Credits
// reset monthly; bought credit packs never expire and are used after the allotment.
export const PLANS = {
  free: { homes: 1, designsPerHome: 2, emailsPerHome: 5, credits: 30 },
  pro: { homes: null, designsPerHome: null, emailsPerHome: null, credits: 300 },
}
export const PRICES = { month: { amount: 5000, currency: 'usd' }, year: { amount: 50000, currency: 'usd' } }
export const CREDIT_PACKS = {
  c100: { credits: 100, amount: 1500, currency: 'usd' },
  c500: { credits: 500, amount: 6000, currency: 'usd' },
}
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

// ---------------------------------------------------------------- credits

const addMonths = (d, n) => {
  const x = new Date(d)
  const day = x.getUTCDate()
  x.setUTCDate(1)
  x.setUTCMonth(x.getUTCMonth() + n)
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate()
  x.setUTCDate(Math.min(day, last))
  return x
}

// The monthly credit cycle. Pro follows the subscription's renewal date (a yearly
// plan resets on the same day each month); everyone else resets on the 1st (UTC).
export function creditCycle(ent, now = new Date()) {
  if (ent.plan === 'pro' && ent.periodEnd) {
    let start = new Date(ent.periodEnd)
    for (let i = 0; i < 14 && start > now; i++) start = addMonths(start, -1)
    return { start, next: addMonths(start, 1) }
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { start, next: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) }
}

const packPoolFor = (mode) => `pack:${mode === 'off' ? 'live' : mode}`
const unmeteredFor = (ent) => Boolean(ent.unlimited || ent.source === 'admin')

async function creditsFor(user, ent) {
  const cyc = creditCycle(ent)
  const allotment = PLANS[ent.plan].credits
  const c = await creditBalance(user.id, { since: cyc.start.toISOString(), packPool: packPoolFor(ent.mode), planPool: `plan:${ent.plan}` })
  const planLeft = Math.max(0, allotment - c.planUsed)
  return {
    unlimited: unmeteredFor(ent),
    allotment,
    used: Math.min(allotment, c.planUsed),
    usedThisCycle: c.cycleUsed,
    planLeft,
    packs: c.packs,
    available: planLeft + c.packs,
    cycleStart: cyc.start.toISOString(),
    resetsAt: cyc.next.toISOString(),
    resetsInDays: Math.max(0, Math.ceil((cyc.next - Date.now()) / 864e5)),
  }
}

export async function billingFor(user, propertyId = null) {
  const row = await getBillingRow(user.id)
  const ent = entitlement(row, user)
  const limits = PLANS[ent.plan]
  const [usage, credits] = await Promise.all([usageFor(user.id, propertyId), creditsFor(user, ent)])
  return { ...ent, limits: ent.unlimited ? PLANS.pro : limits, usage, credits }
}

export async function creditsOnly(user) {
  const ent = entitlement(await getBillingRow(user.id), user)
  return creditsFor(user, ent)
}

// Upgrading starts a fresh allotment: each plan counts only its own spends.
// Charge one credit before an image is generated. Returns a refund function for
// when the render fails; throws 402 when the account has no credits left.
export async function chargeCredit(user, { kind, ref }) {
  const ent = entitlement(await getBillingRow(user.id), user)
  const cyc = creditCycle(ent)
  const id = `cr_${crypto.randomUUID()}`
  const pool = await debitCredit(user.id, {
    id,
    kind,
    ref,
    since: cyc.start.toISOString(),
    allotment: PLANS[ent.plan].credits,
    packPool: packPoolFor(ent.mode),
    planPool: `plan:${ent.plan}`,
    unmetered: unmeteredFor(ent),
  })
  if (!pool) {
    const err = limitError('credits', PLANS[ent.plan].credits, ent)
    err.extra.resetsAt = cyc.next.toISOString()
    throw err
  }
  return { id, pool, refund: () => refundCredit(id) }
}

// ---------------------------------------------------------------- limit checks

function limitError(kind, limit, ent) {
  const msg = {
    homes: `The Free plan includes ${limit} home. Upgrade to Pro for unlimited homes.`,
    designs: `The Free plan includes ${limit} designs per home. Upgrade to Pro for unlimited designs.`,
    emails: `The Free plan includes ${limit} emailed shares per home. Upgrade to Pro, or copy the link instead.`,
    credits: `You’ve used all ${limit} render credits for this month. Buy more credits${ent.plan === 'pro' ? '' : ' or upgrade to Pro'} to keep rendering.`,
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
  if (!b.credits.unlimited && b.credits.available <= 0) throw limitError('credits', b.credits.allotment, b)
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

// ---------------------------------------------------------------- credit packs

export async function previewBuyCredits(user, packKey) {
  const pack = CREDIT_PACKS[packKey]
  if (!pack) throw new ApiError(400, 'bad_pack', 'Unknown credit pack.')
  const id = `prev_${crypto.randomUUID()}`
  await addCredits(user.id, { id, credits: pack.credits, mode: 'preview', ref: packKey })
  await recordBillingEvent({ id, source: 'preview', type: 'credits', userId: user.id, data: { pack: packKey, credits: pack.credits } })
}

export async function creditsCheckout(user, packKey, origin) {
  const pack = CREDIT_PACKS[packKey]
  if (!pack) throw new ApiError(400, 'bad_pack', 'Unknown credit pack.')
  const row = await getBillingRow(user.id)
  const customer = await customerFor(user, row)
  const s = await stripe('POST', 'checkout/sessions', {
    mode: 'payment',
    customer,
    client_reference_id: user.id,
    line_items: { 0: { quantity: 1, price_data: { currency: pack.currency, unit_amount: pack.amount, product_data: { name: `Sceneshare render credits × ${pack.credits}` } } } },
    payment_intent_data: { metadata: { userId: user.id, kind: 'credits', pack: packKey } },
    metadata: { userId: user.id, kind: 'credits', pack: packKey, credits: String(pack.credits) },
    success_url: `${origin}/plan?credits=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plan?credits=cancel`,
  })
  await recordBillingEvent({ id: `co_${s.id}`, source: 'stripe', type: 'credits_checkout_started', userId: user.id, data: { pack: packKey, session: s.id } })
  return s.url
}

// Add a paid Checkout session's credits (from the webhook or the return page).
export async function applyCreditSession(userId, session) {
  if (session?.metadata?.kind !== 'credits' || session.payment_status !== 'paid') return false
  const pack = CREDIT_PACKS[session.metadata.pack]
  if (!pack) return false
  return addCredits(userId, { id: `cs_${session.id}`, credits: pack.credits, mode: session.livemode ? 'live' : 'test', ref: session.metadata.pack, data: { session: session.id, amount: session.amount_total } })
}

export async function syncCreditSession(user, sessionId) {
  if (!/^cs_[A-Za-z0-9_]+$/.test(String(sessionId || ''))) return false
  const s = await stripe('GET', `checkout/sessions/${sessionId}`)
  if (s.client_reference_id !== user.id && s.metadata?.userId !== user.id) return false
  return applyCreditSession(user.id, s)
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

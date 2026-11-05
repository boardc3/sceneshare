import crypto from 'node:crypto'
import { billingState, config } from './config.js'
import { addCredits, creditBalance, debitCredit, getBillingRow, recordBillingEvent, refundCredit, setBilling, usageFor } from './db.js'
import { isAdmin } from './gate.js'
import { ApiError } from './http.js'

// Plans (Chris, 2026-11-04): a 14-day free trial, then Entry ($49/month, 2 homes)
// or Premium ($99/month, 5 homes), with Premium add-ons of 5 more homes for $75
// each. Yearly is 10× monthly. Every rendered image costs one credit; a take the
// alignment check throws away and refires is on us. Credits reset monthly; bought
// credit packs never expire and are used after the allotment. Limits are checked
// on the server; the browser only displays them.
export const TRIAL_DAYS = 14
export const TIERS = ['entry', 'premium']
export const PLANS = {
  trial: { homes: 2, credits: 50, emailsPerHome: 10, designsPerHome: null },
  entry: { homes: 2, credits: 150, emailsPerHome: null, designsPerHome: null },
  premium: { homes: 5, credits: 300, emailsPerHome: null, designsPerHome: null },
  none: { homes: 0, credits: 0, emailsPerHome: 0, designsPerHome: null },
}
export const ADDON = { homes: 5, credits: 150, max: 10 }
export const PRICES = {
  currency: 'usd',
  entry: { month: 4900, year: 49000 },
  premium: { month: 9900, year: 99000 },
  addon: { month: 7500, year: 75000 },
}
export const CREDIT_PACKS = {
  c100: { credits: 100, amount: 1500, currency: 'usd' },
  c500: { credits: 500, amount: 6000, currency: 'usd' },
}
const PREVIEW_DAYS = { month: 30, year: 365 }
// A failed renewal keeps the plan this long while Stripe retries the card.
const GRACE_MS = 3 * 864e5
const ACTIVE = ['active', 'trialing', 'past_due']
const tierOf = (p) => (p === 'pro' ? 'premium' : TIERS.includes(p) ? p : null) // 'pro' = before 2026-11-04
const clampAddons = (n) => Math.max(0, Math.min(ADDON.max, Math.floor(Number(n) || 0)))

// ---------------------------------------------------------------- entitlement

// The plan an account is on right now: trial, entry, premium or none (trial over).
export function entitlement(row, user = null) {
  const mode = billingState()
  const now = Date.now()
  const end = row?.period_end ? new Date(row.period_end).getTime() : null
  const base = {
    mode,
    plan: 'none',
    paid: false,
    addons: 0,
    source: row?.plan_source || null,
    status: row?.plan_status || null,
    interval: row?.plan_interval || null,
    periodEnd: end ? new Date(end).toISOString() : null,
    daysLeft: end ? Math.max(0, Math.ceil((end - now) / 864e5)) : null,
    cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
    canManage: Boolean(row?.stripe_customer_id) && (mode === 'test' || mode === 'live'),
    trial: null,
  }
  if (mode === 'off') return { ...base, plan: 'premium', source: 'off', unlimited: true }
  const tier = tierOf(row?.plan)
  const live = tier && ACTIVE.includes(row?.plan_status || '') && end && end + GRACE_MS > now
  // A preview subscription means nothing once real billing is on, and the reverse.
  const sourceMatches = row?.plan_source === 'preview' ? mode === 'preview' : row?.plan_source === 'stripe' ? mode === 'test' || mode === 'live' : row?.plan_source === 'comp'
  if (live && sourceMatches) return { ...base, plan: tier, paid: true, addons: tier === 'premium' ? clampAddons(row?.plan_addons) : 0 }
  if (user && isAdmin(user)) return { ...base, plan: 'premium', source: 'admin', daysLeft: null, periodEnd: null }
  const created = row?.created_at ? new Date(row.created_at).getTime() : now
  const trialEnd = created + TRIAL_DAYS * 864e5
  if (now < trialEnd) return { ...base, plan: 'trial', trial: { endsAt: new Date(trialEnd).toISOString(), startedAt: new Date(created).toISOString(), daysLeft: Math.max(0, Math.ceil((trialEnd - now) / 864e5)) } }
  return base
}

export function limitsFor(ent) {
  if (ent.unlimited) return { homes: null, credits: PLANS.premium.credits, emailsPerHome: null, designsPerHome: null }
  const l = { ...PLANS[ent.plan] }
  if (ent.plan === 'premium' && ent.addons) {
    l.homes += ent.addons * ADDON.homes
    l.credits += ent.addons * ADDON.credits
  }
  if (ent.source === 'admin') l.homes = null
  return l
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

// The monthly credit cycle. Paid plans follow the subscription's renewal date (a
// yearly plan resets on the same day each month); the trial is one cycle; anything
// else resets on the 1st (UTC).
export function creditCycle(ent, now = new Date()) {
  if (ent.paid && ent.periodEnd) {
    let start = new Date(ent.periodEnd)
    for (let i = 0; i < 14 && start > now; i++) start = addMonths(start, -1)
    return { start, next: addMonths(start, 1) }
  }
  if (ent.plan === 'trial' && ent.trial) return { start: new Date(ent.trial.startedAt), next: new Date(ent.trial.endsAt) }
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  return { start, next: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)) }
}

const packPoolFor = (mode) => `pack:${mode === 'off' ? 'live' : mode}`
const unmeteredFor = (ent) => Boolean(ent.unlimited || ent.source === 'admin')

async function creditsFor(user, ent, limits = limitsFor(ent)) {
  const cyc = creditCycle(ent)
  const allotment = limits.credits
  const c = await creditBalance(user.id, { since: cyc.start.toISOString(), packPool: packPoolFor(ent.mode), planPool: `plan:${ent.plan}` })
  const planLeft = Math.max(0, allotment - c.planUsed)
  return {
    unlimited: unmeteredFor(ent),
    allotment,
    used: Math.min(allotment, c.planUsed),
    usedThisCycle: c.cycleUsed,
    planLeft,
    packs: c.packs,
    available: ent.plan === 'none' ? 0 : planLeft + c.packs,
    cycleStart: cyc.start.toISOString(),
    resetsAt: cyc.next.toISOString(),
    resetsInDays: Math.max(0, Math.ceil((cyc.next - Date.now()) / 864e5)),
  }
}

export async function billingFor(user, propertyId = null) {
  const row = await getBillingRow(user.id)
  const ent = entitlement(row, user)
  const limits = limitsFor(ent)
  const [usage, credits] = await Promise.all([usageFor(user.id, propertyId), creditsFor(user, ent, limits)])
  return { ...ent, limits, usage, credits }
}

export async function creditsOnly(user) {
  const ent = entitlement(await getBillingRow(user.id), user)
  return creditsFor(user, ent)
}

// Charge one credit before an image is generated. Returns a refund function for
// when the render fails; throws 402 when the account has no credits left. Each
// plan counts only its own spends, so an upgrade starts a fresh allotment.
export async function chargeCredit(user, { kind, ref }) {
  const ent = entitlement(await getBillingRow(user.id), user)
  if (ent.plan === 'none') throw limitError('expired', null, ent)
  const limits = limitsFor(ent)
  const cyc = creditCycle(ent)
  const id = `cr_${crypto.randomUUID()}`
  const pool = await debitCredit(user.id, {
    id,
    kind,
    ref,
    since: cyc.start.toISOString(),
    allotment: limits.credits,
    packPool: packPoolFor(ent.mode),
    planPool: `plan:${ent.plan}`,
    unmetered: unmeteredFor(ent),
  })
  if (!pool) {
    const err = limitError('credits', limits.credits, ent)
    err.extra.resetsAt = cyc.next.toISOString()
    throw err
  }
  return { id, pool, refund: () => refundCredit(id) }
}

// ---------------------------------------------------------------- limit checks

const PLAN_NAME = { trial: 'free trial', entry: 'Entry', premium: 'Premium', none: '' }

function limitError(kind, limit, ent) {
  const msg = {
    expired: 'Your free trial has ended. Choose Entry or Premium to keep adding homes, rendering and sharing. Your existing share links keep working.',
    homes:
      ent.plan === 'entry'
        ? `Entry includes ${limit} homes. Premium includes 5, and more can be added.`
        : ent.plan === 'premium'
          ? `Your Premium plan includes ${limit} homes. Add 5 more homes for $75 a month.`
          : `The free trial includes ${limit} homes. Choose a plan to add more.`,
    emails: `The free trial includes ${limit} emailed shares per home. Choose a plan, or copy the link instead.`,
    credits: `You’ve used all ${limit} render credits for this ${ent.plan === 'trial' ? 'trial' : 'month'}. Buy more credits to keep rendering.`,
  }[kind]
  return new ApiError(402, 'plan_limit', msg, { limit: kind, max: limit, plan: ent.plan })
}

export async function assertCanAddHome(user) {
  const b = await billingFor(user)
  if (b.plan === 'none') throw limitError('expired', null, b)
  if (b.limits.homes != null && b.usage.homes >= b.limits.homes) throw limitError('homes', b.limits.homes, b)
  return b
}

export async function assertCanAddDesign(user, propertyId) {
  const b = await billingFor(user, propertyId)
  if (b.plan === 'none') throw limitError('expired', null, b)
  if (!b.credits.unlimited && b.credits.available <= 0) throw limitError('credits', b.credits.allotment, b)
  return b
}

export async function assertCanEmail(user, propertyId, count) {
  const b = await billingFor(user, propertyId)
  if (b.plan === 'none') throw limitError('expired', null, b)
  if (b.limits.emailsPerHome != null && b.usage.emails + count > b.limits.emailsPerHome) {
    const left = Math.max(0, b.limits.emailsPerHome - b.usage.emails)
    const err = limitError('emails', b.limits.emailsPerHome, b)
    err.extra.left = left
    throw err
  }
  return b
}

// What a plan costs a month (or a year) with its add-ons, in cents.
export function planPrice(tier, interval, addons = 0) {
  const per = interval === 'year' ? 'year' : 'month'
  return PRICES[tier][per] + (tier === 'premium' ? clampAddons(addons) * PRICES.addon[per] : 0)
}

function readChoice(body) {
  const tier = TIERS.includes(body?.tier) ? body.tier : null
  if (!tier) throw new ApiError(400, 'bad_tier', 'Choose Entry or Premium.')
  return { tier, interval: body.interval === 'year' ? 'year' : 'month', addons: tier === 'premium' ? clampAddons(body.addons) : 0 }
}
export { readChoice }

// ---------------------------------------------------------------- preview mode
// Lets the whole trial → subscribe → change → cancel → expire cycle run with no money moving.

export async function previewSubscribe(user, { tier, interval, addons }) {
  const days = PREVIEW_DAYS[interval] || 30
  const row = await setBilling(user.id, {
    plan: tier,
    addons,
    status: 'active',
    source: 'preview',
    interval,
    periodEnd: new Date(Date.now() + days * 864e5).toISOString(),
    cancelAtPeriodEnd: false,
  })
  await recordBillingEvent({ id: `prev_${crypto.randomUUID()}`, source: 'preview', type: 'subscribe', userId: user.id, data: { tier, interval, addons, days } })
  return row
}

export async function previewChange(user, { tier, addons }) {
  const row = await getBillingRow(user.id)
  if (row?.plan_source !== 'preview' || !tierOf(row?.plan)) throw new ApiError(400, 'no_subscription', 'There is no subscription to change.')
  const out = await setBilling(user.id, { plan: tier, addons })
  await recordBillingEvent({ id: `prev_${crypto.randomUUID()}`, source: 'preview', type: 'change', userId: user.id, data: { tier, addons } })
  return out
}

export async function previewSetCancel(user, cancel) {
  const row = await getBillingRow(user.id)
  if (row?.plan_source !== 'preview' || !tierOf(row?.plan)) throw new ApiError(400, 'no_subscription', 'There is no subscription to change.')
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

// One Stripe product per thing sold, found by metadata (created the first time).
const PRODUCT_NAMES = { entry: 'Sceneshare Entry', premium: 'Sceneshare Premium', addon: 'Sceneshare Premium · 5 more homes' }
const productCache = new Map()
export async function productFor(key) {
  if (productCache.has(key)) return productCache.get(key)
  const found = await stripe('GET', 'products/search', { query: `metadata['ss_key']:'${key}' AND active:'true'`, limit: 1 })
  let id = found?.data?.[0]?.id
  if (!id) id = (await stripe('POST', 'products', { name: PRODUCT_NAMES[key], metadata: { ss_key: key } }, { idempotencyKey: `prod_${key}_v1` })).id
  productCache.set(key, id)
  return id
}
const priceData = async (key, interval) => ({ currency: PRICES.currency, unit_amount: PRICES[key][interval], recurring: { interval }, product: await productFor(key) })

export async function checkoutSession(user, { tier, interval, addons }, origin) {
  const row = await getBillingRow(user.id)
  const customer = await customerFor(user, row)
  const line_items = { 0: { quantity: 1, price_data: await priceData(tier, interval) } }
  if (tier === 'premium' && addons > 0) line_items[1] = { quantity: addons, price_data: await priceData('addon', interval) }
  const meta = { userId: user.id, tier, addons: String(addons) }
  const s = await stripe('POST', 'checkout/sessions', {
    mode: 'subscription',
    customer,
    client_reference_id: user.id,
    line_items,
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    subscription_data: { metadata: meta },
    metadata: { ...meta, interval },
    success_url: `${origin}/plan?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/plan?checkout=cancel`,
  })
  await recordBillingEvent({ id: `co_${s.id}`, source: 'stripe', type: 'checkout_started', userId: user.id, data: { tier, interval, addons, session: s.id } })
  return s.url
}

// Switch tier or add-ons on a live subscription, prorated.
export async function changeSubscription(user, { tier, addons }) {
  const row = await getBillingRow(user.id)
  if (!row?.stripe_subscription_id || !ACTIVE.includes(row.plan_status || '')) throw new ApiError(400, 'no_subscription', 'There is no subscription to change.')
  const sub = await stripe('GET', `subscriptions/${row.stripe_subscription_id}`)
  const items = sub.items?.data || []
  const interval = items[0]?.price?.recurring?.interval === 'year' ? 'year' : 'month'
  const addonProduct = await productFor('addon')
  const prodId = (it) => (typeof it.price?.product === 'string' ? it.price.product : it.price?.product?.id)
  const addonItem = items.find((it) => prodId(it) === addonProduct)
  const tierItem = items.find((it) => it !== addonItem)
  const params = { proration_behavior: 'create_prorations', metadata: { userId: user.id, tier, addons: String(addons) }, items: {} }
  let i = 0
  params.items[i++] = { id: tierItem.id, price_data: await priceData(tier, interval), quantity: 1 }
  if (addons > 0) params.items[i++] = addonItem ? { id: addonItem.id, quantity: addons } : { price_data: await priceData('addon', interval), quantity: addons }
  else if (addonItem) params.items[i++] = { id: addonItem.id, deleted: 'true' }
  const next = await stripe('POST', `subscriptions/${sub.id}`, params, { idempotencyKey: `chg_${sub.id}_${tier}_${addons}_${Math.floor(Date.now() / 60000)}` })
  await recordBillingEvent({ id: `chg_${crypto.randomUUID()}`, source: 'stripe', type: 'change', userId: user.id, data: { tier, addons } })
  return applySubscription(user.id, next)
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

// Copy a Stripe subscription onto the account. The tier and add-on count come from
// the item prices (and the subscription's metadata when prices are ambiguous).
export function readSubscription(sub) {
  const items = sub?.items?.data || []
  let tier = null
  let addons = 0
  for (const it of items) {
    const amt = it.price?.unit_amount
    const per = it.price?.recurring?.interval === 'year' ? 'year' : 'month'
    if (amt === PRICES.addon[per]) addons = it.quantity || 1
    else if (amt === PRICES.entry[per]) tier = 'entry'
    else if (amt === PRICES.premium[per]) tier = 'premium'
  }
  tier = tier || tierOf(sub?.metadata?.tier) || 'premium'
  if (!addons && sub?.metadata?.addons) addons = Number(sub.metadata.addons) || 0
  return { tier, addons: tier === 'premium' ? clampAddons(addons) : 0 }
}

export async function applySubscription(userId, sub) {
  const item = sub?.items?.data?.[0]
  const periodEnd = sub.current_period_end || item?.current_period_end || null
  const live = ACTIVE.includes(sub.status)
  const { tier, addons } = readSubscription(sub)
  return setBilling(userId, {
    plan: live ? tier : null,
    addons,
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

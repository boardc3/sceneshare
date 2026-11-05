import { originOf } from '../_lib/auth.js'
import { ADDON, CREDIT_PACKS, PLANS, PRICES, TRIAL_DAYS, applyCreditSession, applySubscription, billingFor, changeSubscription, checkoutSession, creditsCheckout, portalSession, previewBuyCredits, previewChange, previewSetCancel, previewSubscribe, readChoice, syncCreditSession, syncFromStripe, verifyWebhook } from '../_lib/billing.js'
import { billingState, config } from '../_lib/config.js'
import { ensureUserRow, logSubmission, recordBillingEvent, userByStripeCustomer } from '../_lib/db.js'
import { requireUser, validId } from '../_lib/gate.js'
import { ApiError, query, readJson, route, send } from '../_lib/http.js'

// GET  /api/billing[?propertyId=…][&sync=1]   the account's plan, limits, usage and days left
// POST /api/billing { op: 'checkout', tier: 'entry'|'premium', interval: 'month'|'year', addons }  → { url } (Stripe) or the new plan (preview)
// POST /api/billing { op: 'change', tier, addons }                 switch tier or add-ons on an active subscription (prorated)
// POST /api/billing { op: 'credits', pack: 'c100'|'c500' }        → { url } (Stripe) or the new balance (preview)
// GET  /api/billing?session=cs_…                                  apply a paid credit purchase on return from Checkout
// POST /api/billing { op: 'portal' }                               → { url } Stripe's billing portal
// POST /api/billing { op: 'cancel' | 'resume' }                    preview mode only
// POST /api/billing?webhook=1                                      Stripe webhooks (signed)

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (typeof req.body === 'string') return req.body
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body) // already parsed: signature will not match
  const chunks = []
  for await (const c of req) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

const SUB_EVENTS = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted', 'customer.subscription.paused', 'customer.subscription.resumed']

async function webhook(req, res) {
  const raw = await rawBody(req)
  if (!verifyWebhook(raw, req.headers['stripe-signature'])) {
    console.error(JSON.stringify({ t: 'billing', msg: 'webhook signature rejected', configured: Boolean(config.stripeWebhookSecret) }))
    throw new ApiError(400, 'bad_signature', 'Signature check failed.')
  }
  const event = JSON.parse(raw)
  const obj = event.data?.object || {}
  const customer = typeof obj.customer === 'string' ? obj.customer : obj.customer?.id
  const owner = (customer && (await userByStripeCustomer(customer))) || null
  const userId = owner?.id || obj.metadata?.userId || obj.client_reference_id || null
  const fresh = await recordBillingEvent({ id: event.id, source: 'stripe', type: event.type, userId, data: { livemode: event.livemode, object: obj.id, status: obj.status, customer } })
  res._meta = { event: event.type, userId, duplicate: !fresh }
  if (!fresh) return send(res, 200, { ok: true, duplicate: true })
  if (!userId) {
    console.error(JSON.stringify({ t: 'billing', msg: 'webhook for unknown customer', type: event.type, customer }))
    return send(res, 200, { ok: true, ignored: true })
  }
  if (SUB_EVENTS.includes(event.type)) {
    const row = await applySubscription(userId, obj)
    console.log(JSON.stringify({ t: 'billing', msg: 'subscription', type: event.type, userId, status: obj.status, plan: row?.plan }))
  } else if (event.type === 'checkout.session.completed' && obj.metadata?.kind === 'credits') {
    const added = await applyCreditSession(userId, obj)
    console.log(JSON.stringify({ t: 'billing', msg: 'credits purchased', userId, session: obj.id, added }))
  } else if (event.type === 'checkout.session.completed' && obj.subscription) {
    console.log(JSON.stringify({ t: 'billing', msg: 'checkout completed', userId, session: obj.id }))
  } else if (event.type === 'invoice.payment_failed') {
    console.log(JSON.stringify({ t: 'billing', msg: 'payment failed', userId, invoice: obj.id, attempt: obj.attempt_count }))
  }
  send(res, 200, { ok: true })
}

export default route(
  ['GET', 'POST'],
  async (req, res) => {
    const q = query(req)
    if (req.method === 'POST' && q.webhook === '1') return webhook(req, res)

    const user = await requireUser(req, res)
    await ensureUserRow(user)
    const mode = billingState()

    if (req.method === 'GET') {
      if (q.sync === '1' && (mode === 'test' || mode === 'live')) await syncFromStripe(user).catch((e) => console.error(JSON.stringify({ t: 'billing', msg: 'sync failed', err: e.message })))
      if (q.session && (mode === 'test' || mode === 'live')) await syncCreditSession(user, q.session).catch((e) => console.error(JSON.stringify({ t: 'billing', msg: 'credit sync failed', err: e.message })))
      const b = await billingFor(user, validId(q.propertyId) ? q.propertyId : null)
      res._meta = { plan: b.plan, mode }
      return send(res, 200, { ok: true, billing: b, plans: PLANS, prices: PRICES, addon: ADDON, trialDays: TRIAL_DAYS, packs: CREDIT_PACKS })
    }

    const body = await readJson(req)
    const op = String(body.op || '')
    const origin = originOf(req)
    res._meta = { op, mode }
    if (mode === 'off') throw new ApiError(400, 'billing_off', 'Plans are not switched on.')

    if (op === 'checkout') {
      const choice = readChoice(body)
      if (mode === 'preview') {
        await previewSubscribe(user, choice)
        await logSubmission({ user, kind: 'plan_upgrade', meta: { ...choice, mode } })
        return send(res, 200, { ok: true, preview: true, billing: await billingFor(user) })
      }
      const url = await checkoutSession(user, choice, origin)
      await logSubmission({ user, kind: 'checkout_start', meta: { ...choice, mode } })
      return send(res, 200, { ok: true, url })
    }
    if (op === 'change') {
      const { tier, addons } = readChoice(body)
      if (mode === 'preview') await previewChange(user, { tier, addons })
      else await changeSubscription(user, { tier, addons })
      await logSubmission({ user, kind: 'plan_change', meta: { tier, addons, mode } })
      return send(res, 200, { ok: true, billing: await billingFor(user) })
    }
    if (op === 'credits') {
      const pack = String(body.pack || '')
      if (!CREDIT_PACKS[pack]) throw new ApiError(400, 'bad_pack', 'Unknown credit pack.')
      if (mode === 'preview') {
        await previewBuyCredits(user, pack)
        await logSubmission({ user, kind: 'credits_buy', meta: { pack, mode } })
        return send(res, 200, { ok: true, preview: true, billing: await billingFor(user) })
      }
      const url = await creditsCheckout(user, pack, origin)
      await logSubmission({ user, kind: 'credits_checkout', meta: { pack, mode } })
      return send(res, 200, { ok: true, url })
    }
    if (op === 'portal') {
      if (mode === 'preview') throw new ApiError(400, 'preview_mode', 'Payments are in preview: use Cancel or Resume on this page.')
      return send(res, 200, { ok: true, url: await portalSession(user, origin) })
    }
    if (op === 'cancel' || op === 'resume') {
      if (mode !== 'preview') throw new ApiError(400, 'use_portal', 'Manage your subscription in the billing portal.')
      await previewSetCancel(user, op === 'cancel')
      await logSubmission({ user, kind: `plan_${op}`, meta: { mode } })
      return send(res, 200, { ok: true, billing: await billingFor(user) })
    }
    throw new ApiError(400, 'bad_op', 'Unknown request.')
  },
  { name: 'billing', limit: { hour: 300 } },
)

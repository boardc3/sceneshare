import { originOf } from '../_lib/auth.js'
import { BETA, EXTRA, CREDIT_PACKS, PLANS, PRICES, TRIAL_DAYS, applyBetaSession, betaCheckout, previewBuyBeta, applyCreditSession, applySubscription, billingFor, changeSubscription, checkoutSession, creditsCheckout, portalSession, previewBuyCredits, previewBuyExtra, extraCheckout, previewChange, previewSetCancel, previewSubscribe, readChoice, syncCreditSession, stripe, syncFromStripe, verifyWebhook } from '../_lib/billing.js'
import { billingState, config } from '../_lib/config.js'
import { ensureUserRow, logSubmission, recordBillingEvent, userByStripeCustomer } from '../_lib/db.js'
import { isAdmin, requireUser, validId } from '../_lib/gate.js'
import { ApiError, query, readJson, route, send } from '../_lib/http.js'

// GET  /api/billing[?propertyId=…][&sync=1]   the account's plan, limits, usage and days left
// POST /api/billing { op: 'checkout', tier: 'entry'|'premium', interval: 'month'|'year' }  → { url } (Stripe) or the new plan (preview)
// POST /api/billing { op: 'change', tier }                         switch tier on an active subscription (prorated)
// POST /api/billing { op: 'extra', homes }                         Premium: extra properties, $15 each for 30 days + 30 re-renders each
// POST /api/billing { op: 'beta' }                                 the paid beta: $50 once for 30 days → { url } (Stripe) or the new plan (preview)
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
  let event = null
  if (verifyWebhook(raw, req.headers['stripe-signature'])) {
    event = JSON.parse(raw)
  } else {
    // Vercel parses JSON bodies before the handler runs, so the exact signed bytes
    // are often gone. Then the payload is not trusted at all: only its event id is
    // read, and the event itself is fetched from Stripe with the secret key.
    let id = null
    try {
      id = JSON.parse(raw)?.id
    } catch {
      /* not JSON */
    }
    if (typeof id === 'string' && /^evt_[A-Za-z0-9]+$/.test(id) && config.stripeKey) event = await stripe('GET', `events/${id}`).catch(() => null)
    if (!event?.id || event.id !== id) {
      console.error(JSON.stringify({ t: 'billing', msg: 'webhook rejected: bad signature and not retrievable', configured: Boolean(config.stripeWebhookSecret) }))
      throw new ApiError(400, 'bad_signature', 'Signature check failed.')
    }
  }
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
  } else if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && obj.metadata?.kind === 'beta') {
    const started = await applyBetaSession(userId, obj)
    console.log(JSON.stringify({ t: 'billing', msg: 'beta paid', userId, session: obj.id, started }))
  } else if (event.type === 'checkout.session.completed' && (obj.metadata?.kind === 'credits' || obj.metadata?.kind === 'extra')) {
    const added = await applyCreditSession(userId, obj)
    console.log(JSON.stringify({ t: 'billing', msg: `${obj.metadata.kind} purchased`, userId, session: obj.id, added }))
  } else if (event.type === 'checkout.session.completed' && obj.subscription) {
    console.log(JSON.stringify({ t: 'billing', msg: 'checkout completed', userId, session: obj.id }))
  } else if (event.type === 'invoice.payment_failed') {
    console.log(JSON.stringify({ t: 'billing', msg: 'payment failed', userId, invoice: obj.id, attempt: obj.attempt_count }))
  }
  send(res, 200, { ok: true })
}

// Preview mode changes plans and adds credits without payment, so only admins and
// named testers (PREVIEW_TESTER_EMAILS) may use it; everyone else keeps the plan
// and credits they have. Otherwise any account could give itself free credits.
function assertPreviewAllowed(user) {
  if (isAdmin(user) || config.previewTesters.includes(String(user.email || '').toLowerCase())) return
  throw new ApiError(403, 'preview_locked', 'Paid plans and credit purchases open soon. To get more credits now, email Chris@sceneset.ai.')
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
      return send(res, 200, { ok: true, billing: b, plans: PLANS, prices: PRICES, extra: EXTRA, trialDays: TRIAL_DAYS, packs: CREDIT_PACKS, beta: config.paidBeta ? { ...BETA, homes: PLANS.beta.homes, credits: PLANS.beta.credits } : null })
    }

    const body = await readJson(req)
    const op = String(body.op || '')
    const origin = originOf(req)
    res._meta = { op, mode }
    if (mode === 'off') throw new ApiError(400, 'billing_off', 'Plans are not switched on.')

    if (op === 'beta') {
      if (mode === 'preview') {
        assertPreviewAllowed(user)
        await previewBuyBeta(user)
        await logSubmission({ user, kind: 'beta_buy', meta: { mode } })
        return send(res, 200, { ok: true, preview: true, billing: await billingFor(user) })
      }
      const url = await betaCheckout(user, origin)
      await logSubmission({ user, kind: 'beta_checkout', meta: { mode } })
      return send(res, 200, { ok: true, url })
    }
    if (op === 'checkout') {
      const choice = readChoice(body)
      if (mode === 'preview') {
        assertPreviewAllowed(user)
        await previewSubscribe(user, choice)
        await logSubmission({ user, kind: 'plan_upgrade', meta: { ...choice, mode } })
        return send(res, 200, { ok: true, preview: true, billing: await billingFor(user) })
      }
      const url = await checkoutSession(user, choice, origin)
      await logSubmission({ user, kind: 'checkout_start', meta: { ...choice, mode } })
      return send(res, 200, { ok: true, url })
    }
    if (op === 'change') {
      const { tier } = readChoice(body)
      if (mode === 'preview') {
        assertPreviewAllowed(user)
        await previewChange(user, { tier })
      } else await changeSubscription(user, { tier })
      await logSubmission({ user, kind: 'plan_change', meta: { tier, mode } })
      return send(res, 200, { ok: true, billing: await billingFor(user) })
    }
    if (op === 'extra') {
      if (mode === 'preview') {
        assertPreviewAllowed(user)
        await previewBuyExtra(user, body.homes)
        await logSubmission({ user, kind: 'extra_buy', meta: { mode, homes: body.homes } })
        return send(res, 200, { ok: true, preview: true, billing: await billingFor(user) })
      }
      const url = await extraCheckout(user, body.homes, origin)
      await logSubmission({ user, kind: 'extra_checkout', meta: { mode } })
      return send(res, 200, { ok: true, url })
    }
    if (op === 'credits') {
      const pack = String(body.pack || '')
      if (!CREDIT_PACKS[pack]) throw new ApiError(400, 'bad_pack', 'Unknown credit pack.')
      if (mode === 'preview') {
        assertPreviewAllowed(user)
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
      assertPreviewAllowed(user)
      await previewSetCancel(user, op === 'cancel')
      await logSubmission({ user, kind: `plan_${op}`, meta: { mode } })
      return send(res, 200, { ok: true, billing: await billingFor(user) })
    }
    throw new ApiError(400, 'bad_op', 'Unknown request.')
  },
  { name: 'billing', limit: { hour: 300 } },
)

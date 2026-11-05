// The signed-in account's plan, limits and usage (from /api/billing). The server
// enforces every limit; this store only displays them and starts upgrades.
import { useSyncExternalStore } from 'react'
import { track } from './analytics.js'
import { get, post } from './api.js'

let state = { ready: false, billing: null, plans: null, prices: null, packs: null, extra: null, trialDays: 7 }
const subs = new Set()
function set(patch) {
  state = { ...state, ...patch }
  subs.forEach((fn) => fn())
}
export const useBilling = () =>
  useSyncExternalStore(
    (fn) => (subs.add(fn), () => subs.delete(fn)),
    () => state,
  )

// Each render answers with the new balance (lib/api.js broadcasts it).
if (typeof window !== 'undefined') {
  window.addEventListener('ss:credits', (e) => {
    if (state.billing && e.detail) set({ billing: { ...state.billing, credits: e.detail } })
  })
}

let inflight = null
export function loadBilling({ sync = false, session = null } = {}) {
  if (inflight && !sync) return inflight
  const qs = [sync && 'sync=1', session && `session=${encodeURIComponent(session)}`].filter(Boolean).join('&')
  inflight = get(`/api/billing${qs ? `?${qs}` : ''}`)
    .then((d) => (set({ ready: true, billing: d.billing, plans: d.plans, prices: d.prices, packs: d.packs, extra: d.extra, trialDays: d.trialDays }), d.billing))
    .catch(() => (set({ ready: true }), null))
    .finally(() => (inflight = null))
  return inflight
}
export const clearBilling = () => set({ ready: false, billing: null })

// Start a plan: Stripe Checkout, or straight away in preview.
export async function subscribe({ tier, interval = 'month' }, from = 'plan') {
  track('upgrade_start', { tier, interval, from })
  const d = await post('/api/billing', { op: 'checkout', tier, interval })
  if (d.url) {
    window.location.assign(d.url) // Stripe Checkout
    return { redirecting: true }
  }
  set({ billing: d.billing })
  track('upgrade_done', { tier, interval, mode: d.billing?.mode })
  return { billing: d.billing }
}

// Switch tier on the current subscription (prorated by Stripe).
export async function changePlan({ tier }) {
  track('plan_change', { tier })
  const d = await post('/api/billing', { op: 'change', tier })
  set({ billing: d.billing })
  return { billing: d.billing }
}

// Premium: extra properties, $15 each for 30 days with 30 re-renders each.
export async function buyExtra(homes = 5, from = 'plan') {
  track('extra_buy_start', { from, homes })
  const d = await post('/api/billing', { op: 'extra', homes })
  if (d.url) {
    window.location.assign(d.url) // Stripe Checkout
    return { redirecting: true }
  }
  set({ billing: d.billing })
  track('extra_buy_done', { mode: d.billing?.mode })
  return { billing: d.billing }
}

// What a plan costs per interval, in cents.
export const planPrice = (prices, tier, interval) => (prices ? prices[tier][interval] : 0)

export async function buyCredits(pack, from = 'plan') {
  track('credits_buy_start', { pack, from })
  const d = await post('/api/billing', { op: 'credits', pack })
  if (d.url) {
    window.location.assign(d.url) // Stripe Checkout
    return { redirecting: true }
  }
  set({ billing: d.billing })
  track('credits_buy_done', { pack, mode: d.billing?.mode })
  return { billing: d.billing }
}

export async function manageBilling() {
  track('billing_portal')
  const d = await post('/api/billing', { op: 'portal' })
  if (d.url) window.location.assign(d.url)
}

export async function setCancel(cancel) {
  const d = await post('/api/billing', { op: cancel ? 'cancel' : 'resume' })
  set({ billing: d.billing })
  track(cancel ? 'plan_cancel' : 'plan_resume')
  return d.billing
}

// How much of a period is used, for the progress bar.
export function periodShare(b) {
  if (b?.plan === 'trial' && b.trial) return Math.max(0, Math.min(1, b.trial.daysLeft / (state.trialDays || 7)))
  if (!b?.periodEnd || b.daysLeft == null) return null
  const total = b.interval === 'year' ? 365 : 30
  return Math.max(0, Math.min(1, b.daysLeft / total))
}

// Homes still available (null = unlimited).
export const homesLeft = (b) => (b?.limits?.homes == null ? null : Math.max(0, b.limits.homes - (b.usage?.homes || 0)))

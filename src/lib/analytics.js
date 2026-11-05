// Analytics, two layers, both cookieless:
//  1. Vercel Web Analytics — page views, referrers, countries, devices (dashboard in Vercel).
//  2. First-party events in our own database (/api/events) — every action in the
//     product, so we can see what owners and buyers actually do.
// Visitors can decline in the cookie notice; Global Privacy Control is honoured as
// a decline. Declined visitors send no analytics at all — only error reports,
// which carry no identifiers.
import { inject } from '@vercel/analytics'
import { startPage } from './engagement.js'

const CONSENT_KEY = 'ss:consent' // 'all' | 'essential'
const VID_KEY = 'ss:vid'
const SID_KEY = 'ss:sid'

const ls = {
  get: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      if (v == null) localStorage.removeItem(k)
      else localStorage.setItem(k, v)
    } catch {
      /* private mode */
    }
  },
}
const ss = {
  get: (k) => {
    try {
      return sessionStorage.getItem(k)
    } catch {
      return null
    }
  },
  set: (k, v) => {
    try {
      sessionStorage.setItem(k, v)
    } catch {
      /* private mode */
    }
  },
}

const rid = (n = 16) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('')

// Global Privacy Control or Do Not Track: either one turns analytics off.
export const gpc = () =>
  typeof navigator !== 'undefined' && (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1')
export const consent = () => {
  const v = ls.get(CONSENT_KEY)
  return v === 'all' || v === 'essential' ? v : null
}
// US/California model: on unless declined (or GPC).
export const analyticsAllowed = () => !gpc() && consent() !== 'essential'

const listeners = new Set()
export const onConsent = (fn) => (listeners.add(fn), () => listeners.delete(fn))

export function setConsent(v) {
  ls.set(CONSENT_KEY, v)
  if (v === 'essential') {
    ls.set(VID_KEY, null)
    queue.length = 0
  } else startVercel()
  listeners.forEach((fn) => fn(v))
  sendNow([{ name: 'consent', path: location.pathname, at: new Date().toISOString(), props: { choice: v, gpc: gpc() } }], { anonymous: true })
}

function visitorId() {
  let v = ls.get(VID_KEY)
  if (!v) {
    v = rid()
    ls.set(VID_KEY, v)
  }
  return v
}
function sessionId() {
  let v = ss.get(SID_KEY)
  if (!v) {
    v = rid()
    ss.set(SID_KEY, v)
  }
  return v
}

export function analyticsHeaders() {
  if (!analyticsAllowed()) return {}
  return { 'x-ss-visitor': visitorId(), 'x-ss-session': sessionId() }
}

const queue = []
let timer = null
const lang = () => document.documentElement.dataset.lang || 'en'

function sendNow(events, { anonymous = false, beacon = false } = {}) {
  if (!events.length) return
  const body = JSON.stringify({ events, lang: lang(), ...(anonymous || !analyticsAllowed() ? {} : { visitorId: visitorId(), sessionId: sessionId() }) })
  try {
    if (beacon && navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', new Blob([body], { type: 'application/json' }))
      return
    }
    fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  } catch {
    /* never let analytics break the page */
  }
}

function flush(beacon = false) {
  clearTimeout(timer)
  timer = null
  const batch = queue.splice(0, 50)
  sendNow(batch, { beacon })
  if (queue.length) flush(beacon)
}

export function track(name, props = null, { propertyId = null } = {}) {
  if (!analyticsAllowed()) return
  queue.push({ name, path: location.pathname, props, propertyId, at: new Date().toISOString(), ...(name === 'page_view' && document.referrer ? { referrer: document.referrer } : {}) })
  if (!timer) timer = setTimeout(flush, 1500)
}

export function pageView(path) {
  const m = /^\/(p|studio)\/([a-z0-9]{6,20})/.exec(path)
  track('page_view', { title: document.title.slice(0, 120) }, { propertyId: m ? m[2] : null })
  startPage(path, m ? m[2] : null)
}

// Send whatever is queued now (used by lib/engagement.js when the tab is hidden).
export const flushEvents = (beacon = false) => flush(beacon)

// Errors always go out (no visitor id, no session id): they are how we fix things.
let errorsSent = 0
export function reportError(error, extra = {}) {
  if (errorsSent++ > 20) return
  const message = String(error?.message || error || 'unknown').slice(0, 500)
  sendNow([{ name: 'client_error', path: location.pathname, at: new Date().toISOString(), props: { message, stack: String(error?.stack || '').slice(0, 1500), ...extra } }], { anonymous: true })
}

let vercelStarted = false
function startVercel() {
  if (vercelStarted || !analyticsAllowed()) return
  vercelStarted = true
  try {
    inject({ mode: import.meta.env.PROD ? 'production' : 'development', debug: false })
  } catch {
    /* blocked by an extension */
  }
}

export function initAnalytics() {
  startVercel()
  window.addEventListener('error', (e) => reportError(e.error || e.message, { source: 'window', file: e.filename, line: e.lineno }))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { source: 'promise' }))
  window.addEventListener('pagehide', () => flush(true))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush(true))
}

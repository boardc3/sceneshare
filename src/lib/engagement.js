// Engaged time per page and per section, for session length and "what do people
// actually look at". Counts only while the tab is visible and someone has touched,
// scrolled, typed or moved the mouse in the last minute. Sections are any element
// with data-section="name"; the one filling most of the screen gets the time.
// A modal (the room viewer) can claim the time with focusSection().
// Goes out as one 'engagement' event per page per flush (route change, tab hidden,
// every 30 s) through the normal analytics queue, so declining analytics stops it.
import { analyticsAllowed, flushEvents, track } from './analytics.js'

const IDLE_MS = 60_000
const TICK_MS = 1000
const FLUSH_MS = 30_000

let page = null // { path, propertyId, kind, activeMs, spanStart, sections, rooms, seq }
let lastInput = Date.now()
let override = null // { name, room }
const seen = new WeakSet()
const shown = new Map() // element -> visible px
let io = null
let started = false

export const pageKind = (path) => (path === '/' ? 'home' : path.startsWith('/p/') ? 'share' : path.startsWith('/studio/') ? 'studio' : path.split('/')[1] || 'home')

function observeNew() {
  if (!io) return
  document.querySelectorAll('[data-section]').forEach((el) => {
    if (seen.has(el)) return
    seen.add(el)
    io.observe(el)
  })
  for (const el of shown.keys()) if (!el.isConnected) shown.delete(el)
}

function primarySection() {
  let best = null
  let px = 0
  for (const [el, h] of shown) {
    if (h > px && el.isConnected) {
      px = h
      best = el.dataset.section
    }
  }
  return px >= Math.min(160, window.innerHeight * 0.25) ? best : null
}

function tick() {
  if (!page) return
  const now = Date.now()
  const dt = Math.min(now - page.lastTick, 2 * TICK_MS)
  page.lastTick = now
  if (document.visibilityState !== 'visible' || now - lastInput > IDLE_MS) return
  page.activeMs += dt
  const sec = override?.name || primarySection()
  if (sec) page.sections[sec] = (page.sections[sec] || 0) + dt
  if (override && override.room != null) page.rooms[override.room] = (page.rooms[override.room] || 0) + dt
}

function emit() {
  if (!page || page.activeMs < 1000) return
  const sections = Object.fromEntries(Object.entries(page.sections).map(([k, v]) => [k, Math.round(v)]))
  const top = Object.entries(sections).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  track(
    'engagement',
    { kind: page.kind, activeMs: Math.round(page.activeMs), spanMs: Date.now() - page.spanStart, sections, rooms: page.rooms, top, seq: page.seq++ },
    { propertyId: page.propertyId },
  )
  page.activeMs = 0
  page.sections = {}
  page.rooms = {}
  page.spanStart = Date.now()
}

function ensureStarted() {
  if (started || typeof window === 'undefined') return
  started = true
  const bump = () => (lastInput = Date.now())
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'scroll', 'wheel', 'touchstart']) window.addEventListener(ev, bump, { passive: true, capture: true })
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(
      (entries) => entries.forEach((e) => shown.set(e.target, e.isIntersecting ? e.intersectionRect.height : 0)),
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    )
  }
  setInterval(() => {
    observeNew()
    tick()
  }, TICK_MS)
  setInterval(() => {
    emit()
  }, FLUSH_MS)
  const away = () => {
    tick()
    emit()
    flushEvents(true)
  }
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && away())
  window.addEventListener('pagehide', away)
}

// Called on every route change (lib/analytics.js pageView).
export function startPage(path, propertyId = null) {
  if (!analyticsAllowed()) return
  ensureStarted()
  if (page) {
    tick()
    emit()
  }
  override = null
  lastInput = Date.now()
  page = { path, propertyId, kind: pageKind(path), activeMs: 0, spanStart: Date.now(), lastTick: Date.now(), sections: {}, rooms: {}, seq: 0 }
  setTimeout(observeNew, 300)
}

// A modal claims the time while open (e.g. the room viewer on photo 3).
export function focusSection(name, room = null) {
  tick()
  override = name ? { name, room } : null
}

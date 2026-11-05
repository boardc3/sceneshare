// Sends errors to the error log (/api/errors, reviewed on /admin): failed requests
// as the visitor saw them and JavaScript crashes. Batched; flushed on page hide.
// Never throws and never reports its own failures.
const queue = []
let timer = null
let sent = 0
const MAX_PER_PAGE = 60 // a broken loop shouldn't flood the log

function flush(beacon = false) {
  clearTimeout(timer)
  timer = null
  if (!queue.length) return
  const body = JSON.stringify({ errors: queue.splice(0, 20), lang: document.documentElement.dataset.lang || 'en' })
  try {
    if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/errors', new Blob([body], { type: 'application/json' }))
    else fetch('/api/errors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'same-origin' }).catch(() => {})
  } catch {
    /* ignore */
  }
  if (queue.length) flush(beacon)
}

export function logError(entry) {
  if (sent >= MAX_PER_PAGE) return
  if (entry.path === '/api/errors' || entry.path === '/api/events') return
  sent++
  queue.push({ ...entry, page: location.pathname + location.search, at: new Date().toISOString() })
  if (!timer) timer = setTimeout(flush, 1200)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => flush(true))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush(true))
}

// Client side of the API: JSON in and out, the analytics ids (only when the
// visitor allows analytics), and clear errors.
import { analyticsHeaders } from './analytics.js'

export class ApiError extends Error {
  constructor(code, message, status) {
    super(message)
    this.code = code
    this.status = status
  }
}

// Errors the page doesn't explain itself are announced (components/ApiErrors.jsx):
// a caller that shows the error inline marks it with shown(e) and no notice appears.
// Flows that have their own prompt (plans, terms, sign-in) never announce.
const OWN_PROMPT = new Set(['plan_limit', 'terms_required', 'sign_in_required'])
function announce(err) {
  if (OWN_PROMPT.has(err.code)) return
  setTimeout(() => {
    if (err.handled) return
    window.dispatchEvent(new CustomEvent('ss:api-error', { detail: { code: err.code, status: err.status, message: err.message, path: err.path, method: err.method, requestId: err.requestId, at: new Date().toISOString() } }))
  }, 0)
}
export const shown = (e) => {
  if (e && typeof e === 'object') e.handled = true
  return e?.message || ''
}
export const quietly = (e) => (shown(e), e)

async function handle(r, meta = {}) {
  let data = null
  try {
    data = await r.json()
  } catch {
    /* non-JSON */
  }
  if (!r.ok || !data?.ok) {
    const err = new ApiError(data?.error || 'http_' + r.status, data?.message || '', r.status)
    err.data = data
    Object.assign(err, meta, { requestId: r.headers.get('x-vercel-id') || null })
    announce(err)
    // A plan limit anywhere opens the upgrade prompt (components/Chrome.jsx).
    if (err.code === 'plan_limit') window.dispatchEvent(new CustomEvent('ss:plan-limit', { detail: { limit: data.limit, max: data.max, plan: data.plan, message: data.message } }))
    if (err.code === 'terms_required') window.dispatchEvent(new CustomEvent('ss:terms-required'))
    throw err
  }
  // Renders return the account's credit balance; the nav meter follows it.
  if (data.credits) window.dispatchEvent(new CustomEvent('ss:credits', { detail: data.credits }))
  return data
}

// Set by auth.js: when the session has ended, sign in again, then retry once.
let recover = null
export const setAuthRecovery = (fn) => (recover = fn)
let recovering = null

async function send(path, init) {
  const once = async () => {
    let r
    const meta = { path: path.split('?')[0], method: init.method || 'GET' }
    try {
      r = await fetch(path, { credentials: 'same-origin', ...init, headers: { ...(init.headers || {}), ...analyticsHeaders() } })
    } catch {
      const err = Object.assign(new ApiError('network', '', 0), meta)
      announce(err)
      throw err
    }
    return handle(r, meta)
  }
  try {
    return await once()
  } catch (e) {
    if (e.code !== 'sign_in_required' || !recover || path.startsWith('/api/account')) throw e
    recovering = recovering || recover().finally(() => (recovering = null))
    if (!(await recovering)) throw e
    return once()
  }
}

export const get = (path) => send(path, {})
export const post = (path, body) => send(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

// Errors worth another try: the model was busy or slow, the network blinked.
export const retriable = (e) => e?.code === 'network' || e?.status === 0 || e?.status === 429 || e?.status === 502 || e?.status === 503 || e?.status === 504 || e?.code === 'render_failed' || e?.code === 'render_busy' || e?.code === 'property_busy' || e?.code === 'server_error' || /^http_5/.test(e?.code || '')

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let healthCache = null
export function health() {
  if (!healthCache) healthCache = get('/api/health').catch((e) => (shown(e), { features: {} }))
  return healthCache
}

// Hand-off from a search to the studio (so the studio paints instantly).
const memory = new Map()
export const rememberProperty = (p) => p?.id && memory.set(p.id, p)
export const recalledProperty = (id) => memory.get(id) || null

// Shrink a camera or library photo in the browser before upload: honours EXIF
// orientation, caps the long edge at 2048 px, JPEG at 0.88 (Vercel's request
// body limit is 4.5 MB).
export async function shrinkPhoto(file, maxEdge = 2048) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }
  const w = bitmap.width
  const h = bitmap.height
  const s = Math.min(1, maxEdge / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * s)
  canvas.height = Math.round(h * s)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.88)
}

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

async function handle(r) {
  let data = null
  try {
    data = await r.json()
  } catch {
    /* non-JSON */
  }
  if (!r.ok || !data?.ok) throw new ApiError(data?.error || 'http_' + r.status, data?.message || '', r.status)
  return data
}

// Set by auth.js: when the session has ended, sign in again, then retry once.
let recover = null
export const setAuthRecovery = (fn) => (recover = fn)
let recovering = null

async function send(path, init) {
  const once = async () => {
    let r
    try {
      r = await fetch(path, { credentials: 'same-origin', ...init, headers: { ...(init.headers || {}), ...analyticsHeaders() } })
    } catch {
      throw new ApiError('network', '', 0)
    }
    return handle(r)
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
  if (!healthCache) healthCache = get('/api/health').catch(() => ({ features: {} }))
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

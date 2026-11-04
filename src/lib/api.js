// Client side of the API. Every submission goes through `withEmail`, which opens
// the email gate the first time and reuses the saved email after that.

const EMAIL_KEY = 'ss:email'
const store = {
  get(k) {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* private mode: keep in memory only */
    }
  },
}

let memEmail = null
export const savedEmail = () => memEmail || store.get(EMAIL_KEY)

// --- email gate plumbing (the modal lives in EmailGate.jsx) ---
let listener = null
export function onGateRequest(fn) {
  listener = fn
  return () => {
    if (listener === fn) listener = null
  }
}
export function requestEmail(context) {
  const e = savedEmail()
  if (e) return Promise.resolve(e)
  if (!listener) return Promise.resolve(null)
  return new Promise((resolve) => listener({ context, resolve }))
}
export async function rememberEmail(email, lang, context) {
  memEmail = email
  store.set(EMAIL_KEY, email)
  try {
    await post('/api/lead', { email, lang, context })
  } catch {
    /* the next submission logs it anyway */
  }
}

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

export async function get(path) {
  let r
  try {
    r = await fetch(path)
  } catch {
    throw new ApiError('network', '')
  }
  return handle(r)
}

export async function post(path, body) {
  let r
  try {
    r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  } catch {
    throw new ApiError('network', '')
  }
  return handle(r)
}

// Gate, then post with the email attached. Resolves null when the visitor
// dismisses the gate.
export async function submit(path, body, context) {
  const email = await requestEmail(context)
  if (!email) return null
  try {
    return await post(path, { ...body, email })
  } catch (e) {
    if (e.code === 'email_required') {
      memEmail = null
      store.set(EMAIL_KEY, '')
      const again = await requestEmail(context)
      if (!again) return null
      return post(path, { ...body, email: again })
    }
    throw e
  }
}

let healthCache = null
export function health() {
  if (!healthCache) healthCache = get('/api/health').catch(() => ({ features: {} }))
  return healthCache
}

// --- local property cache: the studio works before (and without) a database ---
const PKEY = (id) => `ss:property:${id}`
export function cacheProperty(p) {
  try {
    // Inline images can blow the quota; drop the cache rather than the session.
    localStorage.setItem(PKEY(p.id), JSON.stringify(p))
    const ids = JSON.parse(localStorage.getItem('ss:owned') || '[]').filter((x) => x !== p.id)
    ids.unshift(p.id)
    localStorage.setItem('ss:owned', JSON.stringify(ids.slice(0, 30)))
  } catch {
    /* quota or private mode */
  }
}
export function cachedProperty(id) {
  try {
    const raw = localStorage.getItem(PKEY(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

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

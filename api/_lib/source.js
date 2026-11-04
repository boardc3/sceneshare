import { getImage } from './db.js'
import { ApiError } from './http.js'
import { downloadImage, fromDataUrl, isAllowedImageUrl } from './storage.js'

// A photo reaches the server as a data URL (an upload when no storage is set up),
// one of our own image paths (/api/media for Neon-stored images, /api/img for
// proxied listing photos), or a URL on an allowed host (Blob, listing CDNs).
export async function loadImageInput(src) {
  if (typeof src !== 'string' || !src) throw new ApiError(400, 'image_required', 'Choose a photo first.')
  if (src.startsWith('data:')) {
    const d = fromDataUrl(src)
    if (!d) throw new ApiError(400, 'bad_image', 'That file is not a photo we can read. Use a JPEG, PNG, HEIC or WebP.')
    return d.buffer
  }
  if (src.startsWith('/api/media?')) {
    const id = new URL(src, 'http://local').searchParams.get('id') || ''
    const img = /^[a-z0-9]{16}$/.test(id) ? await getImage(id) : null
    if (img) return img.buffer
    throw new ApiError(404, 'image_missing', 'That photo is no longer available. Upload it again.')
  }
  if (src.startsWith('/api/img?')) {
    const u = new URL(src, 'http://local').searchParams.get('u')
    if (u && isAllowedImageUrl(u)) return downloadImage(u)
  }
  if (isAllowedImageUrl(src)) return downloadImage(src)
  throw new ApiError(400, 'image_not_allowed', 'That photo address cannot be used. Upload the photo instead.')
}

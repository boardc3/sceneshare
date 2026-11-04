import { addPhoto, ensureProperty, logSubmission } from './_lib/db.js'
import { newId, requireEmail } from './_lib/gate.js'
import { readJson, route, send } from './_lib/http.js'
import { normalize } from './_lib/images.js'
import { loadImageInput } from './_lib/source.js'
import { storeImage, toDataUrl } from './_lib/storage.js'

// "Take the photos yourself": the browser shrinks the photo to 2048 px before
// sending (Vercel's 4.5 MB body limit), we fix orientation, store it (Blob or
// Neon) and record it against the property.
export default route(['POST'], async (req, res) => {
  const body = await readJson(req)
  const email = requireEmail(body)
  const propertyId = /^[a-z0-9]{6,20}$/.test(body.propertyId || '') ? body.propertyId : 'loose'
  const n = await normalize(await loadImageInput(body.image), 2048)
  const id = newId(6)
  const stored = await storeImage(n.buffer, { propertyId, kind: `own-${id}` })
  const photo = { id, src: stored || toDataUrl(n.buffer), width: n.width, height: n.height, source: 'owner', credit: 'Photo by owner' }
  if (stored && propertyId !== 'loose') {
    await ensureProperty(propertyId, { email, lang: body.lang })
    await addPhoto(propertyId, photo, { email })
  }
  await logSubmission({ email, kind: 'photo_upload', propertyId, lang: body.lang, address: body.addressText || null, meta: { photoId: id, width: n.width, height: n.height } })
  send(res, 200, { ok: true, photo })
})

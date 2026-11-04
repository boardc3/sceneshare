import { logSubmission } from './_lib/db.js'
import { newId, requireEmail } from './_lib/gate.js'
import { readJson, route, send } from './_lib/http.js'
import { normalize } from './_lib/images.js'
import { loadImageInput } from './_lib/source.js'
import { storeImage, toDataUrl } from './_lib/storage.js'

// "Take the photos yourself": the browser shrinks the photo to 2048 px before
// sending (Vercel's 4.5 MB body limit), we fix orientation and store it.
export default route(['POST'], async (req, res) => {
  const body = await readJson(req)
  const email = requireEmail(body)
  const propertyId = String(body.propertyId || 'loose').slice(0, 20)
  const n = await normalize(await loadImageInput(body.image), 2048)
  const stored = await storeImage(n.buffer, `properties/${propertyId}/own-${newId(6)}.jpg`)
  await logSubmission({ email, kind: 'photo_upload', propertyId, lang: body.lang, address: body.addressText || null })
  send(res, 200, { ok: true, photo: { id: newId(6), src: stored || toDataUrl(n.buffer), width: n.width, height: n.height, source: 'owner', credit: 'Photo by owner' } })
})

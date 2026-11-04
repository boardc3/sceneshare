import { insertPhotoRows, logSubmission, mutateProperty } from './_lib/db.js'
import { newId, requireOwner, requireUser } from './_lib/gate.js'
import { ApiError, readJson, route, send } from './_lib/http.js'
import { normalize } from './_lib/images.js'
import { loadImageInput } from './_lib/source.js'
import { storeImage } from './_lib/storage.js'

// "Take the photos yourself": the browser shrinks the photo to 2048 px before
// sending (Vercel's 4.5 MB body limit), we fix orientation, store it (Blob or
// Neon) and add it to the owner's home.
export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const { user, row } = await requireOwner(req, res, body.propertyId)
    if (typeof body.image !== 'string' || !body.image.startsWith('data:image/')) throw new ApiError(400, 'bad_image', 'Choose a photo to upload.')
    const n = await normalize(await loadImageInput(body.image), 2048)
    const id = newId(6)
    const stored = await storeImage(n.buffer, { propertyId: row.id, kind: `own-${id}` })
    if (!stored) throw new ApiError(503, 'storage_not_configured', 'Photo storage is not set up yet.')
    const photo = { id, src: stored, width: n.width, height: n.height, source: 'owner', credit: 'Photo by owner', caption: '', versions: [] }
    await insertPhotoRows(row.id, [photo], user, 1000)
    await mutateProperty(row.id, (p) => ({ ...p, photos: [...p.photos, photo] }))
    await logSubmission({ user, kind: 'photo_upload', propertyId: row.id, lang: body.lang, meta: { photoId: id, width: n.width, height: n.height } })
    res._meta = { propertyId: row.id, photoId: id }
    send(res, 200, { ok: true, photo })
  },
  { name: 'upload', before: requireUser, limit: { hour: 200, day: 600 } },
)

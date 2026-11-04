import { addDesign, normalizeProperty, publicView, removeDesign, removePhoto, setDesign, setHidden, pickVersion } from '../shared/model.js'
import { sessionUser } from './_lib/auth.js'
import { config } from './_lib/config.js'
import { deleteProperty, listProperties, logSubmission, mutateProperty, propertyRow, recordView, setPhotoHidden, upsertDesign } from './_lib/db.js'
import { newId, requireOwner, requireUser, validId } from './_lib/gate.js'
import { ApiError, query, readJson, route, send } from './_lib/http.js'
import { background, visitorId } from './_lib/log.js'
import { LIGHT_KEYS, STYLE_KEYS } from './_lib/prompts.js'

// GET  ?id=…        a home: the full studio copy for its owner, the buyer view for everyone else
// GET  ?mine=1      the signed-in account's homes ("My homes")
// POST { op, … }    owner changes: designs, picks, hidden photos, delete
export default route(
  ['GET', 'POST'],
  async (req, res) => {
    if (!config.databaseUrl) throw new ApiError(503, 'sharing_not_configured', 'Saving homes is not set up yet.')
    if (req.method === 'GET') return read(req, res)
    return write(req, res)
  },
  { name: 'properties' },
)

async function read(req, res) {
  const q = query(req)
  if (q.mine === '1') {
    const user = await requireUser(req, res)
    const rows = await listProperties(user.id)
    return send(res, 200, { ok: true, properties: rows })
  }
  if (!validId(q.id)) throw new ApiError(400, 'bad_id', 'That link is not valid.')
  const row = await propertyRow(q.id)
  if (!row) throw new ApiError(404, 'not_found', 'This home is no longer shared, or the link is wrong.')
  const user = await sessionUser(req, res)
  const owner = Boolean(user && (row.owner_user_id === user.id || (!row.owner_user_id && user.emailVerified && row.owner_email?.toLowerCase() === user.email)))
  const p = { ...normalizeProperty(row.data), updatedAt: row.updated_at, shareViews: row.share_views }
  if (!owner && q.view === '1') {
    const shareId = /^[a-z0-9]{10}$/.test(q.s || '') ? q.s : null
    background(recordView(q.id, { lang: q.lang === 'zh' ? 'zh' : 'en', req, visitorId: visitorId(req), shareId }))
  }
  res._meta = { propertyId: q.id, owner }
  send(res, 200, { ok: true, owner, property: owner && q.full === '1' ? p : publicView(p) })
}

const OPS = ['design.create', 'design.finish', 'design.delete', 'design.feature', 'version.pick', 'photo.hide', 'photo.delete', 'property.rename', 'property.delete']

async function write(req, res) {
  const body = await readJson(req)
  const op = String(body.op || '')
  if (!OPS.includes(op)) throw new ApiError(400, 'bad_op', 'Unknown change.')
  const { user, row } = await requireOwner(req, res, body.propertyId)
  const id = row.id
  res._meta = { propertyId: id, op }
  const lang = body.lang === 'zh' ? 'zh' : 'en'

  if (op === 'property.delete') {
    await deleteProperty(id)
    await logSubmission({ user, kind: 'property_delete', propertyId: id, lang })
    return send(res, 200, { ok: true, deleted: id })
  }

  let design = null
  const next = await mutateProperty(id, (p) => {
    const d = p.designs.find((x) => x.id === body.designId)
    switch (op) {
      case 'design.create': {
        const mode = body.mode === 'polish' ? 'polish' : 'redesign'
        design = {
          id: newId(8),
          mode,
          style: mode === 'redesign' ? (STYLE_KEYS.includes(body.style) ? body.style : 'signature') : null,
          light: LIGHT_KEYS.includes(body.light) ? body.light : 'daylight',
          note: String(body.note || '').trim().slice(0, 400),
          createdAt: new Date().toISOString(),
          status: 'running',
          total: p.photos.filter((ph) => !ph.hidden).length,
          picks: {},
          failed: [],
        }
        if (!design.total) throw new ApiError(400, 'no_photos', 'Add photos of the home first.')
        return addDesign(p, design)
      }
      case 'design.finish': {
        if (!d) throw new ApiError(404, 'design_missing', 'That design was removed.')
        const failed = (Array.isArray(body.failed) ? body.failed : []).filter((x) => p.photos.some((ph) => ph.id === x) && !d.picks[x])
        const out = setDesign(p, d.id, { status: failed.length ? 'partial' : 'done', failed })
        design = out.designs.find((x) => x.id === d.id)
        return out
      }
      case 'design.delete':
        if (!d) return false
        return removeDesign(p, d.id)
      case 'design.feature':
        if (!d) throw new ApiError(404, 'design_missing', 'That design was removed.')
        return { ...p, featured: d.id }
      case 'version.pick': {
        const ph = p.photos.find((x) => x.id === body.photoId)
        const v = ph?.versions.find((x) => x.id === body.versionId)
        if (!d || !v || v.designId !== d.id) throw new ApiError(400, 'bad_version', 'That version belongs to another design.')
        return pickVersion(p, d.id, ph.id, v.id)
      }
      case 'photo.delete': {
        if (!p.photos.some((x) => x.id === body.photoId)) return false
        return removePhoto(p, body.photoId)
      }
      case 'property.rename':
        return { ...p, nickname: String(body.name || '').trim().slice(0, 80) || null }
      case 'photo.hide': {
        if (!p.photos.some((x) => x.id === body.photoId)) throw new ApiError(404, 'photo_missing', 'That photo is no longer part of this home.')
        return setHidden(p, body.photoId, !!body.hidden)
      }
      default:
        return false
    }
  })

  if (op === 'photo.hide') background(setPhotoHidden(id, body.photoId, !!body.hidden))
  if (design) background(upsertDesign(design, { propertyId: id, user }))
  if (op.startsWith('design.')) {
    background(logSubmission({ user, kind: op.replace('.', '_'), propertyId: id, lang, meta: { designId: design?.id || body.designId, mode: design?.mode, style: design?.style, light: design?.light } }))
  }
  const full = { ...next, updatedAt: new Date().toISOString() }
  send(res, 200, { ok: true, property: full, design })
}


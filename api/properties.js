import { addDesign, BASE_MODES, normalizeProperty, publicView, removeDesign, removePhoto, setBase, setDesign, setHidden, pickVersion } from '../shared/model.js'
import { sessionUser } from './_lib/auth.js'
import { assertCanAddDesign } from './_lib/billing.js'
import { config, TERMS_VERSION } from './_lib/config.js'
import { deleteDesignRows, deleteProperty, insertPhotoRows, listProperties, logSubmission, mutateProperty, ownerAccepted, propertyRow, recordView, setPhotoHidden, upsertDesign } from './_lib/db.js'
import { newId, requireOwner, requireUser, validId } from './_lib/gate.js'
import { ApiError, query, readJson, route, send } from './_lib/http.js'
import { background, visitorId } from './_lib/log.js'
import { LIGHT_KEYS, STYLE_KEYS } from './_lib/prompts.js'
import { nearby, POI_VERSION } from './_lib/mapbox.js'
import { removeImages, storeImage } from './_lib/storage.js'
import { aerial, isLocked, streetView } from './_lib/exterior.js'
import { normalize } from './_lib/images.js'

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
  // Buyers read share pages (GET) a lot from shared offices; edits are the owner's.
  { name: 'properties', limit: { GET: { hour: 3000 }, POST: { hour: 1500, day: 8000 } } },
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
  const accepted = ownerAccepted(row, TERMS_VERSION)
  // Until its owner accepts the Terms, a home is not shown to anyone else: only who
  // shared it, so the visitor can ask them (Chris, 2026-11-04).
  if (!owner && !accepted) {
    const email = row.owner_account_email || row.owner_email || null
    res._meta = { propertyId: q.id, gated: true }
    return send(res, 200, { ok: true, owner: false, gated: true, sharer: { name: row.owner_name || (email ? email.split('@')[0] : null), email } })
  }
  const p = { ...normalizeProperty(row.data), updatedAt: row.updated_at, shareViews: row.share_views }
  // Homes saved before the richer, classified places get them on first view.
  if (p.address?.lat && (p.poisV || 1) < POI_VERSION && config.mapboxToken) {
    const fresh = await nearby(p.address.lat, p.address.lng, q.lang === 'zh' ? 'zh' : 'en').catch(() => null)
    if (fresh?.length) {
      p.pois = fresh
      p.poisV = POI_VERSION
      background(mutateProperty(p.id, (cur) => ({ ...cur, pois: fresh, poisV: POI_VERSION })).catch(() => null))
    }
  }
  if (!owner && q.view === '1') {
    const shareId = /^[a-z0-9]{10}$/.test(q.s || '') ? q.s : null
    background(recordView(q.id, { lang: q.lang === 'zh' ? 'zh' : 'en', req, visitorId: visitorId(req), shareId }))
  }
  res._meta = { propertyId: q.id, owner }
  send(res, 200, { ok: true, owner, termsAccepted: accepted, property: owner && q.full === '1' ? p : publicView(p) })
}

const OPS = ['photos.order', 'exterior.fetch', 'design.create', 'design.finish', 'design.review', 'design.base', 'photo.base', 'photos.dropListing', 'design.delete', 'design.feature', 'version.pick', 'photo.hide', 'photo.delete', 'property.rename', 'property.delete']

async function write(req, res) {
  const body = await readJson(req)
  const op = String(body.op || '')
  if (!OPS.includes(op)) throw new ApiError(400, 'bad_op', 'Unknown change.')
  const { user, row } = await requireOwner(req, res, body.propertyId)
  const id = row.id
  res._meta = { propertyId: id, op }
  const lang = body.lang === 'zh' ? 'zh' : 'en'
  // Single-photo edits don't use up a Free plan's whole-house designs (they still count toward fair use).
  if (op === 'design.create') await assertCanAddDesign(user, id)

  // The exterior: fetched once per home (Street View, else an aerial of the lot),
  // stored like listing photos, before the home is updated below.
  let exterior = null
  if (op === 'exterior.fetch') {
    const cur = normalizeProperty(row.data)
    if (cur.exteriorChecked || !cur.address?.lat) return send(res, 200, { ok: true, property: { ...cur, updatedAt: new Date().toISOString() }, exterior: { skipped: true } })
    const hasAerial = cur.photos.some((ph) => ph.source === 'aerial')
    const [sv, air] = await Promise.all([streetView(cur.address), hasAerial ? { ok: false, reason: 'have' } : aerial(cur.address)])
    const keep = async (shot, source, kind, credit, caption) => {
      if (!shot.ok) return null
      try {
        const n = await normalize(shot.buffer, 1600)
        const src = await storeImage(n.buffer, { propertyId: id, kind })
        return src ? { id: newId(6), src, width: n.width, height: n.height, source, credit, caption, versions: [] } : null
      } catch {
        return null
      }
    }
    exterior = {
      street: await keep(sv, 'streetview', 'streetview', `Street View ${sv.copyright || '© Google'}${sv.date ? ` · ${sv.date}` : ''}`, 'Street view'),
      aerial: await keep(air, 'aerial', 'aerial', '© Mapbox © OpenStreetMap © Maxar', 'Aerial view'),
      reasons: { street: sv.ok ? null : sv.reason, aerial: air.ok ? null : air.reason },
    }
    res._meta = { propertyId: id, op, street: Boolean(exterior.street), aerial: Boolean(exterior.aerial), reasons: exterior.reasons }
    const added = [exterior.street, exterior.aerial].filter(Boolean)
    if (added.length) await insertPhotoRows(id, added, user)
  }

  if (op === 'property.delete') {
    const doomed = normalizeProperty(row.data)
    await deleteProperty(id)
    background(removeImages(doomed.photos.flatMap((ph) => [ph.src, ...ph.versions.map((v) => v.src)])).catch(() => {}))
    await logSubmission({ user, kind: 'property_delete', propertyId: id, lang })
    return send(res, 200, { ok: true, deleted: id })
  }

  let design = null
  const next = await mutateProperty(id, (p) => {
    const d = p.designs.find((x) => x.id === body.designId)
    switch (op) {
      case 'design.create': {
        const mode = ['polish', 'cleanup'].includes(body.mode) ? body.mode : 'redesign'
        // A design can cover chosen photos only (e.g. "clean up the photo I just uploaded").
        const scope = Array.isArray(body.photoIds) ? [...new Set(body.photoIds.map(String))].filter((x) => p.photos.some((ph) => ph.id === x && !isLocked(ph))).slice(0, 60) : null
        if (Array.isArray(body.photoIds) && !scope.length) throw new ApiError(404, 'photo_missing', 'That photo is no longer part of this home.')
        design = {
          id: newId(8),
          mode,
          style: mode === 'redesign' ? (STYLE_KEYS.includes(body.style) ? body.style : 'signature') : null,
          light: LIGHT_KEYS.includes(body.light) ? body.light : 'daylight',
          note: String(body.note || '').trim().slice(0, 400),
          createdAt: new Date().toISOString(),
          status: 'running',
          // Street View / aerial imagery is shown as captured, never edited.
          total: scope ? scope.length : p.photos.filter((ph) => !ph.hidden && !isLocked(ph)).length,
          ...(scope ? { scope } : {}),
          picks: {},
          failed: [],
        }
        if (!design.total) throw new ApiError(400, 'no_photos', 'Add photos of the home first.')
        return addDesign(p, design)
      }
      case 'design.finish': {
        if (!d) throw new ApiError(404, 'design_missing', 'That design was removed.')
        const failed = (Array.isArray(body.failed) ? body.failed : []).filter((x) => p.photos.some((ph) => ph.id === x) && !d.picks[x])
        let out = setDesign(p, d.id, { status: failed.length ? 'partial' : 'done', failed })
        // A finished "Make it professional" round becomes the starting point for later
        // restyles of its photos (those without one already); the owner can switch back.
        if (d.mode === 'cleanup') out = setBase(out, out.photos.filter((ph) => d.picks[ph.id] && !ph.base).map((ph) => ph.id), d.id)
        design = out.designs.find((x) => x.id === d.id)
        return out
      }
      // The owner's review pass: per photo "looks good" or a note to apply later.
      // Private to the owner (publicView never includes it).
      case 'design.review': {
        if (!d) throw new ApiError(404, 'design_missing', 'That design was removed.')
        const phId = String(body.photoId || '')
        if (!p.photos.some((ph) => ph.id === phId)) throw new ApiError(404, 'photo_missing', 'That photo is no longer part of this home.')
        const review = { ...(d.review || {}) }
        const status = ['ok', 'change'].includes(body.status) ? body.status : null
        if (!status) delete review[phId]
        else review[phId] = { status, note: status === 'change' ? String(body.note || '').trim().slice(0, 600) : '', at: new Date().toISOString() }
        return setDesign(p, d.id, { review })
      }
      // Start later restyles from this finishing round (on: true) or from the originals.
      case 'design.base': {
        if (!d) throw new ApiError(404, 'design_missing', 'That design was removed.')
        if (!BASE_MODES.includes(d.mode)) throw new ApiError(400, 'not_a_finish', 'Only a “Make it professional” or relight round can be a starting point.')
        const ids = Object.keys(d.picks)
        if (body.on === false) return setBase(p, p.photos.filter((ph) => ph.base === d.id).map((ph) => ph.id), null)
        return setBase(p, ids, d.id)
      }
      case 'photo.base': {
        const ph = p.photos.find((x) => x.id === body.photoId)
        if (!ph) throw new ApiError(404, 'photo_missing', 'That photo is no longer part of this home.')
        if (!body.designId) return setBase(p, [ph.id], null)
        const bd = p.designs.find((x) => x.id === body.designId)
        if (!bd || !BASE_MODES.includes(bd.mode) || !bd.picks[ph.id]) throw new ApiError(400, 'not_a_finish', 'That round has no professional version of this photo.')
        return setBase(p, [ph.id], bd.id)
      }
      // Use only my own photos: the photos pulled from listing sites leave this home.
      case 'photos.dropListing': {
        let out = { ...p, ownOnly: true, listingChecked: true }
        for (const ph of p.photos.filter((x) => ['zillow', 'redfin', 'homes'].includes(x.source))) out = removePhoto(out, ph.id)
        return out
      }
      // The owner's order for the photos (studio and share page alike).
      case 'photos.order': {
        const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
        const byId = new Map(p.photos.map((ph) => [ph.id, ph]))
        if (ids.length !== p.photos.length || new Set(ids).size !== ids.length || !ids.every((x) => byId.has(x))) throw new ApiError(400, 'bad_order', 'The photo list changed — reload and try again.')
        return { ...p, photos: ids.map((x) => byId.get(x)), ordered: true }
      }
      case 'exterior.fetch': {
        if (p.exteriorChecked) return false
        const have = new Set(p.photos.map((ph) => ph.source))
        const street = exterior?.street && !have.has('streetview') ? [exterior.street] : []
        const air = exterior?.aerial && !have.has('aerial') ? [exterior.aerial] : []
        // Street view leads (the first thing a buyer sees is the house); the aerial closes.
        // Done for good once Street View answered (an image, or no coverage here). A
        // refused key, a timeout or an outage leaves the home to try again next time.
        const final = Boolean(exterior?.street) || /zero_results|not_found/.test(exterior?.reasons?.street || '') || have.has('streetview')
        return { ...p, photos: [...street, ...p.photos, ...air], exteriorChecked: final, exterior: exterior ? { street: Boolean(exterior.street) || have.has('streetview'), aerial: Boolean(exterior.aerial) || have.has('aerial'), reasons: exterior.reasons, at: new Date().toISOString() } : p.exterior }
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

  // A discarded round: its images are deleted for good, not just unlinked.
  if (op === 'design.delete' && body.designId) {
    const gone = normalizeProperty(row.data).photos.flatMap((ph) => ph.versions.filter((v) => v.designId === body.designId).map((v) => v.src))
    background(Promise.all([removeImages(gone), deleteDesignRows(id, body.designId)]).catch(() => {}))
  }
  if (op === 'photos.dropListing') {
    const gone = normalizeProperty(row.data).photos.filter((x) => ['zillow', 'redfin', 'homes'].includes(x.source))
    background(removeImages(gone.flatMap((ph) => [ph.src, ...ph.versions.map((v) => v.src)])).catch(() => {}))
  }
  if (op === 'photo.delete' && body.photoId) {
    const ph = normalizeProperty(row.data).photos.find((x) => x.id === body.photoId)
    if (ph) background(removeImages([ph.src, ...ph.versions.map((v) => v.src)]).catch(() => {}))
  }
  if (op === 'photo.hide') background(setPhotoHidden(id, body.photoId, !!body.hidden))
  if (design) background(upsertDesign(design, { propertyId: id, user }))
  if (op.startsWith('design.') && op !== 'design.review' && op !== 'design.base') {
    background(logSubmission({ user, kind: op.replace('.', '_'), propertyId: id, lang, meta: { designId: design?.id || body.designId, mode: design?.mode, style: design?.style, light: design?.light } }))
  }
  const full = { ...next, updatedAt: new Date().toISOString() }
  send(res, 200, { ok: true, property: full, design })
}


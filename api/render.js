import { normalizeProperty, addVersion, startingImage } from '../shared/model.js'
import { chargeCredit, creditsOnly } from './_lib/billing.js'
import { logSubmission, mutateProperty, saveRender, upsertDesign } from './_lib/db.js'
import { newId, requireOwner, requireUser } from './_lib/gate.js'
import { generateImage } from './_lib/gemini.js'
import { ApiError, readJson, route, send } from './_lib/http.js'
import { alignmentScore } from './_lib/align.js'
import { fitTo, nearestRatio, normalize, outputSize } from './_lib/images.js'
import { buildFeedbackPrompt, buildRenderPrompt, PRO_RETRY_PREFIX, RETRY_PREFIX } from './_lib/prompts.js'
import { background } from './_lib/log.js'
import { loadImageInput } from './_lib/source.js'
import { isLocked } from './_lib/exterior.js'
import { storeImage } from './_lib/storage.js'

export const maxDuration = 300

// Edge-correlation floor, calibrated 2026-11-04 on the landing demo: aligned
// restyle 0.42, drifted takes 0.25-0.28, 2% camera shift 0.39, 12% zoom-out 0.03.
const ALIGN_MIN = 0.32
// "Make it professional" may straighten verticals and level the camera, which moves
// edges on purpose; only a take that rebuilt the room falls this low.
const ALIGN_MIN_PRO = 0.12

// One photo of one design: the design's restyle (or relight), or a change request
// on the design's current image. The photo and the design are read from the saved
// home — never from the request — so only the owner's own photos are ever sent to
// the model. Always the source photograph as reference 1, always delivered at the
// source's exact aspect ratio, and saved into the design as it lands.
export default route(
  ['POST'],
  async (req, res) => {
    const body = await readJson(req)
    const { user, row } = await requireOwner(req, res, body.propertyId)
    const p = normalizeProperty(row.data)
    const photo = p.photos.find((x) => x.id === body.photoId)
    if (!photo) throw new ApiError(404, 'photo_missing', 'That photo is no longer part of this home.')
    const design = p.designs.find((d) => d.id === body.designId)
    if (!design) throw new ApiError(404, 'design_missing', 'That design was removed.')
    // Google Street View / Mapbox imagery may not be edited (their terms).
    if (isLocked(photo)) throw new ApiError(400, 'photo_locked', 'Street View and aerial images are shown as captured and can’t be restyled. Add your own exterior photo to restyle the outside.')
    const feedback = String(body.feedback || '').trim().slice(0, 800)
    res._meta = { propertyId: p.id, designId: design.id, photoId: photo.id, kind: feedback ? 'feedback' : design.mode }

    let base = null
    if (feedback) {
      base = photo.versions.find((v) => v.id === (body.baseVersionId || design.picks[photo.id]))
      if (!base) throw new ApiError(400, 'current_required', 'Restyle this photo before asking for changes.')
    }

    // One credit per delivered image, taken up front and given back if this fails.
    const charge = await chargeCredit(user, { kind: base ? 'feedback' : 'render', ref: `${p.id}/${design.id}/${photo.id}` })
    try {
      return await renderOne({ req, res, body, user, p, photo, design, base, feedback, charge })
    } catch (e) {
      await charge.refund().catch(() => {})
      throw e
    }
  },
  { name: 'render', before: requireUser, limit: { hour: 400, day: 1500 } },
)

async function renderOne({ res, body, user, p, photo, design, base, feedback, charge }) {
    const started = Date.now()
    // Restyles start from the photo's professional version when it has one.
    const start = startingImage(p, photo, design.mode)
    const source = await normalize(await loadImageInput(start.src), 2048)
    const images = [{ buffer: source.buffer, mimeType: 'image/jpeg' }]
    let prompt
    if (base) {
      const current = await normalize(await loadImageInput(base.src), 2048)
      images.push({ buffer: current.buffer, mimeType: 'image/jpeg' })
      prompt = buildFeedbackPrompt({ feedback, light: 'original' })
    } else {
      prompt = buildRenderPrompt({ mode: design.mode, style: design.style, light: design.light, note: design.note || '' })
    }

    // Generate, then overlay-check against the source. A take whose camera or walls
    // drifted is refired once with a stronger lock; the better-aligned take is kept.
    const aspectRatio = nearestRatio(source.width, source.height)
    let out = await generateImage({ prompt, images, aspectRatio, deadline: started + 200000 })
    let score = await alignmentScore(source.buffer, source.width, source.height, out.buffer).catch(() => 1)
    let attempts = 1
    const pro = !base && design.mode === 'cleanup'
    if (score < (pro ? ALIGN_MIN_PRO : ALIGN_MIN) && Date.now() - started < 120000) {
      try {
        const again = await generateImage({ prompt: (pro ? PRO_RETRY_PREFIX : RETRY_PREFIX) + prompt, images, aspectRatio, deadline: started + 250000 })
        const s2 = await alignmentScore(source.buffer, source.width, source.height, again.buffer).catch(() => 0)
        attempts = 2
        if (s2 > score) {
          out = again
          score = s2
        }
      } catch {
        /* keep the first take */
      }
    }
    const size = outputSize(source.width, source.height)
    const fitted = await fitTo(out.buffer, size.width, size.height)
    const versionId = newId(8)
    const stored = await storeImage(fitted.buffer, { propertyId: p.id, kind: `render-${versionId}` })
    if (!stored) throw new ApiError(503, 'storage_not_configured', 'Image storage is not set up yet.')

    const version = {
      id: versionId,
      designId: design.id,
      baseVersionId: base?.id || null,
      // The professional version this restyle started from, if any.
      fromVersionId: start.versionId || null,
      src: stored,
      width: fitted.width,
      height: fitted.height,
      mode: base ? 'feedback' : design.mode,
      style: design.mode === 'redesign' ? design.style : null,
      light: design.light,
      feedback: feedback || null,
      model: out.model,
      align: Number(score.toFixed(3)),
      attempts,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    }

    const next = await mutateProperty(p.id, (cur) => {
      if (!cur.designs.some((d) => d.id === design.id)) return false
      const out = addVersion(cur, photo.id, version)
      // A change made from the review pass: the note becomes "applied", ready to re-check.
      if (!feedback || body.review !== true) return out
      return { ...out, designs: out.designs.map((d) => (d.id === design.id ? { ...d, review: { ...(d.review || {}), [photo.id]: { status: 'applied', note: feedback, versionId, at: version.at } } } : d)) }
    })
    const saved = next?.designs.find((d) => d.id === design.id)
    if (!saved) throw new ApiError(409, 'design_missing', 'That design was removed while this photo was rendering.')
    await saveRender(version, { propertyId: p.id, photoId: photo.id, user, note: design.note || null, lang: body.lang })
    background(upsertDesign(saved, { propertyId: p.id, user }))
    background(
      logSubmission({
        user,
        kind: base ? 'feedback' : 'render',
        propertyId: p.id,
        lang: body.lang,
        address: p.address?.formatted || null,
        meta: { versionId, designId: design.id, photoId: photo.id, mode: version.mode, style: version.style, light: version.light, feedback: feedback || undefined, ms: version.ms, model: out.model, align: version.align, attempts },
      }),
    )
    res._meta = { ...res._meta, versionId, ms: version.ms, align: version.align, attempts, model: out.model, credit: charge.pool }
    const credits = await creditsOnly(user).catch(() => null)
    send(res, 200, { ok: true, version, design: saved, credits })
}

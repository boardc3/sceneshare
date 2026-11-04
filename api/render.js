import { logSubmission } from './_lib/db.js'
import { newId, requireEmail } from './_lib/gate.js'
import { generateImage } from './_lib/gemini.js'
import { ApiError, readJson, route, send } from './_lib/http.js'
import { alignmentScore } from './_lib/align.js'
import { fitTo, nearestRatio, normalize, outputSize } from './_lib/images.js'
import { buildFeedbackPrompt, buildRenderPrompt, LIGHT_KEYS, RETRY_PREFIX, STYLE_KEYS } from './_lib/prompts.js'
import { loadImageInput } from './_lib/source.js'
import { storeImage, toDataUrl } from './_lib/storage.js'

export const maxDuration = 300

// Edge-correlation floor, calibrated 2026-11-04 on the landing demo: aligned
// restyle 0.42, drifted takes 0.25-0.28, 2% camera shift 0.39, 12% zoom-out 0.03.
const ALIGN_MIN = 0.32

// One render: redesign, polish (relight + photo finish only) or a feedback edit.
// Always Nano Banana Flash, always the source photograph as reference 1, always
// delivered at the source's exact aspect ratio.
export default route(['POST'], async (req, res) => {
  const body = await readJson(req)
  const email = requireEmail(body)
  const mode = ['redesign', 'polish', 'feedback'].includes(body.mode) ? body.mode : 'redesign'
  const style = STYLE_KEYS.includes(body.style) ? body.style : 'signature'
  const light = LIGHT_KEYS.includes(body.light) ? body.light : 'daylight'
  const feedback = String(body.feedback || '').trim()
  if (mode === 'feedback' && !feedback) throw new ApiError(400, 'feedback_required', 'Describe the change you want.')

  const started = Date.now()
  const source = await normalize(await loadImageInput(body.source), 2048)
  const images = [{ buffer: source.buffer, mimeType: 'image/jpeg' }]
  let prompt
  if (mode === 'feedback') {
    if (!body.current) throw new ApiError(400, 'current_required', 'Make a first version before asking for changes.')
    const current = await normalize(await loadImageInput(body.current), 2048)
    images.push({ buffer: current.buffer, mimeType: 'image/jpeg' })
    prompt = buildFeedbackPrompt({ feedback, light: body.light ? light : 'original' })
  } else {
    prompt = buildRenderPrompt({ mode, style, light, note: String(body.note || '').trim() })
  }

  // Generate, then overlay-check against the source. A take whose camera or walls
  // drifted is refired once with a stronger lock; the better-aligned take is kept.
  const aspectRatio = nearestRatio(source.width, source.height)
  let out = await generateImage({ prompt, images, aspectRatio })
  let score = await alignmentScore(source.buffer, source.width, source.height, out.buffer).catch(() => 1)
  let attempts = 1
  if (score < ALIGN_MIN && Date.now() - started < 120000) {
    try {
      const again = await generateImage({ prompt: RETRY_PREFIX + prompt, images, aspectRatio })
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
  const propertyId = String(body.propertyId || 'loose').slice(0, 20)
  const stored = await storeImage(fitted.buffer, `properties/${propertyId}/render-${newId(8)}.jpg`)

  await logSubmission({
    email,
    kind: mode === 'feedback' ? 'feedback' : 'render',
    propertyId,
    lang: body.lang,
    address: body.addressText || null,
    meta: { mode, style, light, feedback: feedback || undefined, ms: Date.now() - started, model: out.model, align: Number(score.toFixed(3)), attempts },
  })

  send(res, 200, {
    ok: true,
    version: {
      id: newId(8),
      src: stored || toDataUrl(fitted.buffer),
      width: fitted.width,
      height: fitted.height,
      mode,
      style: mode === 'redesign' ? style : null,
      light,
      feedback: feedback || null,
      model: out.model,
      align: Number(score.toFixed(3)),
      attempts,
      ms: Date.now() - started,
      at: new Date().toISOString(),
    },
  })
})

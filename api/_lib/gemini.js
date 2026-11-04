import { config } from './config.js'
import { ApiError, fetchWithTimeout } from './http.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

async function call(model, parts, imageConfig, ms) {
  return fetchWithTimeout(
    `${BASE}/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig },
      }),
    },
    ms,
  )
}

// images: [{ buffer, mimeType }] in reference order; the prompt names them.
// Up to two attempts on each of two model ids, inside one overall deadline so a
// render always answers before the function's 300 s limit.
export async function generateImage({ prompt, images, aspectRatio, deadline = Date.now() + 230000 }) {
  if (!config.geminiKey) throw new ApiError(503, 'render_not_configured', 'Rendering is not set up yet. Add GOOGLE_API_KEY in Vercel.')
  const parts = [{ text: prompt }, ...images.map((im) => ({ inline_data: { mime_type: im.mimeType || 'image/jpeg', data: im.buffer.toString('base64') } }))]
  const imageConfig = { aspectRatio, imageSize: config.imageSize }
  const models = [config.imageModel, config.imageModelFallback].filter((m, i, a) => m && a.indexOf(m) === i)

  let last = null
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now()
      if (left < 25000) break
      let r
      try {
        r = await call(model, parts, imageConfig, Math.min(120000, left))
      } catch (e) {
        last = { status: 0, text: e.name === 'AbortError' ? 'timeout' : e.message }
        console.warn(JSON.stringify({ t: 'gemini', msg: 'call failed', model, attempt, err: last.text }))
        continue // a hang is refired once, never waited on (runbook 04)
      }
      if (r.ok) {
        const d = await r.json()
        const cand = d.candidates?.[0]
        const img = cand?.content?.parts?.find((p) => p.inlineData || p.inline_data)
        const data = img?.inlineData || img?.inline_data
        if (data?.data) return { buffer: Buffer.from(data.data, 'base64'), mimeType: data.mimeType || data.mime_type || 'image/png', model }
        const reason = cand?.finishReason || d.promptFeedback?.blockReason || 'no_image'
        if (/SAFETY|PROHIBITED|BLOCK/i.test(reason)) {
          throw new ApiError(422, 'render_blocked', 'The image model declined this photo. Try a different photo or reword your note.')
        }
        last = { status: 200, text: reason }
        console.warn(JSON.stringify({ t: 'gemini', msg: 'no image', model, attempt, reason }))
        continue
      }
      const text = await r.text()
      last = { status: r.status, text: text.slice(0, 300) }
      if (r.status === 402 || (r.status === 403 && /billing|credit|prepay/i.test(text))) {
        console.error(JSON.stringify({ t: 'gemini', msg: 'billing', model, detail: text.slice(0, 300) }))
        throw new ApiError(503, 'render_billing', 'Restyling is paused: the image model account is out of credits. Try again later.')
      }
      if (r.status === 404 || r.status === 400) break // wrong model id or unsupported config → next model
      if (r.status === 429 || r.status >= 500) await new Promise((res) => setTimeout(res, 1500))
      else break
    }
  }
  console.error(JSON.stringify({ t: 'gemini', msg: 'failed', last }))
  if (last?.status === 429) throw new ApiError(429, 'render_busy', 'The image model is busy. Wait a few seconds and try again.')
  throw new ApiError(502, 'render_failed', 'The render did not come back. Try again — it usually works on the second attempt.')
}

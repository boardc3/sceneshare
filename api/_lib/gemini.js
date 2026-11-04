import { config } from './config.js'
import { ApiError, fetchWithTimeout } from './http.js'

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

async function call(model, parts, imageConfig) {
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
    150000,
  )
}

// images: [{ buffer, mimeType }] in reference order; the prompt names them.
export async function generateImage({ prompt, images, aspectRatio }) {
  if (!config.geminiKey) throw new ApiError(503, 'render_not_configured', 'Rendering is not set up yet. Add GOOGLE_API_KEY in Vercel.')
  const parts = [{ text: prompt }, ...images.map((im) => ({ inline_data: { mime_type: im.mimeType || 'image/jpeg', data: im.buffer.toString('base64') } }))]
  const imageConfig = { aspectRatio, imageSize: config.imageSize }
  const models = [config.imageModel, config.imageModelFallback].filter((m, i, a) => m && a.indexOf(m) === i)

  let last = null
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let r
      try {
        r = await call(model, parts, imageConfig)
      } catch (e) {
        last = { status: 0, text: e.name === 'AbortError' ? 'timeout' : e.message }
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
        continue
      }
      const text = await r.text()
      last = { status: r.status, text: text.slice(0, 300) }
      if (r.status === 404 || r.status === 400) break // wrong model id or unsupported config → next model
      if (r.status === 429 || r.status >= 500) await new Promise((res) => setTimeout(res, 1500))
      else break
    }
  }
  console.error('[gemini] failed', last)
  if (last?.status === 429) throw new ApiError(429, 'render_busy', 'The image model is busy. Wait a few seconds and try again.')
  throw new ApiError(502, 'render_failed', 'The render did not come back. Try again — it usually works on the second attempt.')
}

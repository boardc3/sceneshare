import { features, config } from './_lib/config.js'
import { route, send } from './_lib/http.js'

export default route(['GET'], async (_req, res) => {
  send(res, 200, { ok: true, features: features(), model: config.imageModel, mapboxToken: config.mapboxToken || null })
})

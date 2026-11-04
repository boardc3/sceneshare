import { config, features } from './_lib/config.js'
import { ping } from './_lib/db.js'
import { route, send } from './_lib/http.js'

export default route(['GET'], async (_req, res) => {
  send(res, 200, { ok: true, features: features(), db: await ping(), model: config.imageModel, mapboxToken: config.mapboxToken || null })
})

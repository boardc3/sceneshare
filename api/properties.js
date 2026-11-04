import { config } from './_lib/config.js'
import { loadProperty, saveProperty } from './_lib/db.js'
import { requireEmail } from './_lib/gate.js'
import { ApiError, query, readJson, route, send } from './_lib/http.js'

// Saved properties back the share link (/p/<id>). Needs Neon + Blob: a shared
// page must point at stored image URLs, never at inline data.
export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const { id } = query(req)
    if (!/^[a-z0-9]{6,20}$/.test(id || '')) throw new ApiError(400, 'bad_id', 'That link is not valid.')
    if (!config.databaseUrl) throw new ApiError(503, 'sharing_not_configured', 'Sharing is not set up yet.')
    const p = await loadProperty(id)
    if (!p) throw new ApiError(404, 'not_found', 'This property link has expired or never existed.')
    return send(res, 200, { ok: true, property: p })
  }

  const body = await readJson(req)
  const email = requireEmail(body)
  if (!config.databaseUrl || !config.blobToken) {
    throw new ApiError(503, 'sharing_not_configured', 'Sharing needs DATABASE_URL and BLOB_READ_WRITE_TOKEN in Vercel.')
  }
  const p = body.property
  if (!p || !/^[a-z0-9]{6,20}$/.test(p.id || '')) throw new ApiError(400, 'bad_property', 'Nothing to save yet.')
  const isStored = (s) => typeof s === 'string' && /^https:\/\//.test(s)
  // Keep only what a viewer needs; drop anything still inline.
  const clean = {
    id: p.id,
    createdAt: p.createdAt,
    address: p.address,
    parcel: p.parcel,
    pois: p.pois,
    facts: p.facts,
    listing: p.listing,
    photos: (p.photos || [])
      .filter((ph) => isStored(ph.src))
      .map((ph) => ({
        id: ph.id,
        src: ph.src,
        width: ph.width,
        height: ph.height,
        source: ph.source,
        credit: ph.credit,
        caption: ph.caption || '',
        hidden: !!ph.hidden,
        chosen: ph.chosen || null,
        versions: (ph.versions || []).filter((v) => isStored(v.src)).slice(-8),
      })),
  }
  await saveProperty(clean.id, clean, email)
  send(res, 200, { ok: true, id: clean.id, path: `/p/${clean.id}` })
})

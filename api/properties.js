import { config } from './_lib/config.js'
import { loadProperty, recordView, saveSnapshot } from './_lib/db.js'
import { requireEmail } from './_lib/gate.js'
import { ApiError, query, readJson, route, send } from './_lib/http.js'

// Saved properties back the share link (/p/<id>). Needs Neon; images live in Blob
// when it is set up, otherwise in Neon too (/api/media).
const isStored = (s) => typeof s === 'string' && (/^https:\/\//.test(s) || s.startsWith('/api/media?id=') || s.startsWith('/api/img?u='))

export default route(['GET', 'POST'], async (req, res) => {
  if (req.method === 'GET') {
    const { id, view, lang } = query(req)
    if (!/^[a-z0-9]{6,20}$/.test(id || '')) throw new ApiError(400, 'bad_id', 'That link is not valid.')
    if (!config.databaseUrl) throw new ApiError(503, 'sharing_not_configured', 'Sharing is not set up yet.')
    const p = await loadProperty(id)
    if (!p) throw new ApiError(404, 'not_found', 'This property link has expired or never existed.')
    if (view === '1') await recordView(id, { lang: lang === 'zh' ? 'zh' : 'en', req })
    return send(res, 200, { ok: true, property: p })
  }

  const body = await readJson(req)
  const email = requireEmail(body)
  if (!config.databaseUrl) throw new ApiError(503, 'sharing_not_configured', 'Sharing needs DATABASE_URL (Neon) in Vercel.')
  const p = body.property
  if (!p || !/^[a-z0-9]{6,20}$/.test(p.id || '')) throw new ApiError(400, 'bad_property', 'Nothing to save yet.')
  // Keep only what a viewer needs; drop anything still inline.
  const clean = {
    id: p.id,
    createdAt: p.createdAt,
    address: p.address || null,
    parcel: p.parcel || null,
    pois: p.pois || [],
    facts: p.facts || null,
    listing: p.listing || null,
    listingChecked: !!p.listingChecked,
    photos: (p.photos || [])
      .filter((ph) => isStored(ph.src))
      .slice(0, 80)
      .map((ph) => ({
        id: String(ph.id).slice(0, 12),
        src: ph.src,
        width: ph.width ?? null,
        height: ph.height ?? null,
        source: ph.source || null,
        credit: ph.credit || '',
        caption: ph.caption || '',
        hidden: !!ph.hidden,
        chosen: ph.chosen || null,
        versions: (ph.versions || []).filter((v) => isStored(v.src)).slice(-12),
      })),
  }
  const r = await saveSnapshot(clean.id, clean, email)
  if (!r.ok && r.reason === 'not_owner') throw new ApiError(403, 'not_owner', 'Only the person who created this property can change it.')
  send(res, 200, { ok: true, id: clean.id, path: `/p/${clean.id}` })
})

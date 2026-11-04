// The shape of a home, shared by the API and the browser.
//
// property = { id, createdAt, address, parcel, pois, facts, listing, listingChecked,
//              photos: [photo], designs: [design], featured }
// photo    = { id, src, width, height, source, credit, caption, hidden, versions: [version] }
// version  = { id, designId, src, width, height, mode, style, light, feedback,
//              baseVersionId, model, align, attempts, ms, at }
// design   = { id, mode: 'redesign' | 'polish', style, light, note, createdAt,
//              status: 'running' | 'done' | 'partial', total, picks: { photoId: versionId }, failed: [photoId] }
//
// A design is one "Restyle this house" run. Each photo has at most one pick per
// design (the latest render or change request); every image ever made stays in
// photo.versions so the owner can step back through a room's history.

const slug = (s) => String(s || 'none').replace(/[^a-z0-9]+/gi, '').slice(0, 16) || 'none'

// Homes saved before designs existed carry loose versions with a `chosen` pointer.
// Group them into one design per (mode, style, light), in the order they were made.
function adoptLegacy(p) {
  const designs = [...p.designs]
  const byId = new Map(designs.map((d) => [d.id, d]))
  for (const ph of p.photos) {
    let lastDesign = null
    for (const v of ph.versions) {
      if (v.designId && byId.has(v.designId)) {
        lastDesign = byId.get(v.designId)
        continue
      }
      let d
      if (v.mode === 'feedback' && lastDesign) d = lastDesign
      else {
        const mode = v.mode === 'polish' ? 'polish' : 'redesign'
        const id = `old${slug(mode).slice(0, 3)}${slug(v.style).slice(0, 6)}${slug(v.light).slice(0, 4)}`.toLowerCase()
        d = byId.get(id)
        if (!d) {
          d = { id, mode, style: mode === 'redesign' ? v.style || 'signature' : null, light: v.light || 'daylight', note: '', createdAt: v.at || p.createdAt || null, status: 'done', total: 0, picks: {}, failed: [] }
          byId.set(id, d)
          designs.push(d)
        }
      }
      v.designId = d.id
      d.picks[ph.id] = v.id
      lastDesign = d
    }
  }
  designs.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  return designs
}

export function normalizeProperty(raw) {
  if (!raw || typeof raw !== 'object') return raw
  const p = { ...raw }
  p.photos = (Array.isArray(p.photos) ? p.photos : []).map((ph) => ({ ...ph, versions: Array.isArray(ph.versions) ? ph.versions.map((v) => ({ ...v })) : [] }))
  p.designs = (Array.isArray(p.designs) ? p.designs : []).map((d) => ({ picks: {}, failed: [], ...d, picks: { ...(d.picks || {}) }, failed: [...(d.failed || [])] }))
  p.pois = Array.isArray(p.pois) ? p.pois : []
  if (p.photos.some((ph) => ph.versions.some((v) => !v.designId || !p.designs.some((d) => d.id === v.designId)))) p.designs = adoptLegacy(p)
  for (const ph of p.photos) delete ph.chosen
  // A pick must point at a version that still exists.
  const versionIds = new Set(p.photos.flatMap((ph) => ph.versions.map((v) => v.id)))
  for (const d of p.designs) for (const [phId, vId] of Object.entries(d.picks)) if (!versionIds.has(vId)) delete d.picks[phId]
  if (!p.featured || !p.designs.some((d) => d.id === p.featured)) {
    const withPicks = p.designs.filter((d) => Object.keys(d.picks).length)
    p.featured = withPicks.length ? withPicks[withPicks.length - 1].id : null
  }
  return p
}

export const visiblePhotos = (p) => (p?.photos || []).filter((ph) => !ph.hidden)

export function versionFor(property, designId, photoId) {
  const d = property?.designs?.find((x) => x.id === designId)
  const ph = property?.photos?.find((x) => x.id === photoId)
  if (!d || !ph) return null
  const vId = d.picks?.[photoId]
  return vId ? ph.versions.find((v) => v.id === vId) || null : null
}

export function addDesign(p, design) {
  return { ...p, designs: [...p.designs.filter((d) => d.id !== design.id), design] }
}

export function addVersion(p, photoId, version) {
  const photos = p.photos.map((ph) => (ph.id === photoId ? { ...ph, versions: [...ph.versions.filter((v) => v.id !== version.id), version] } : ph))
  let designs = p.designs
  if (version.designId) {
    designs = designs.map((d) =>
      d.id === version.designId ? { ...d, picks: { ...d.picks, [photoId]: version.id }, failed: (d.failed || []).filter((x) => x !== photoId) } : d,
    )
  }
  const next = { ...p, photos, designs }
  if (!next.featured && version.designId) next.featured = version.designId
  return next
}

export function pickVersion(p, designId, photoId, versionId) {
  return { ...p, designs: p.designs.map((d) => (d.id === designId ? { ...d, picks: { ...d.picks, [photoId]: versionId } } : d)) }
}

export function setDesign(p, designId, patch) {
  return { ...p, designs: p.designs.map((d) => (d.id === designId ? { ...d, ...patch } : d)) }
}

export function removeDesign(p, designId) {
  const designs = p.designs.filter((d) => d.id !== designId)
  const photos = p.photos.map((ph) => ({ ...ph, versions: ph.versions.filter((v) => v.designId !== designId) }))
  const next = { ...p, designs, photos }
  if (next.featured === designId) {
    const withPicks = designs.filter((d) => Object.keys(d.picks).length)
    next.featured = withPicks.length ? withPicks[withPicks.length - 1].id : null
  }
  return next
}

export function removePhoto(p, photoId) {
  const photos = p.photos.filter((ph) => ph.id !== photoId)
  const designs = p.designs.map((d) => {
    const picks = { ...d.picks }
    delete picks[photoId]
    return { ...d, picks, failed: (d.failed || []).filter((x) => x !== photoId) }
  })
  return { ...p, photos, designs }
}

export function setHidden(p, photoId, hidden) {
  return { ...p, photos: p.photos.map((ph) => (ph.id === photoId ? { ...ph, hidden: !!hidden } : ph)) }
}

// What a buyer's browser receives: no edit history, only the images each design shows.
export function publicView(p) {
  const shown = new Set(p.designs.flatMap((d) => Object.values(d.picks)))
  return {
    id: p.id,
    createdAt: p.createdAt,
    address: p.address,
    parcel: p.parcel,
    pois: p.pois,
    facts: p.facts,
    listing: p.listing,
    featured: p.featured,
    updatedAt: p.updatedAt,
    designs: p.designs
      .filter((d) => Object.keys(d.picks).length)
      .map(({ id, mode, style, light, createdAt, status, picks }) => ({ id, mode, style, light, createdAt, status, picks })),
    photos: visiblePhotos(p).map((ph) => ({
      id: ph.id,
      src: ph.src,
      width: ph.width,
      height: ph.height,
      source: ph.source,
      credit: ph.credit,
      caption: ph.caption,
      versions: ph.versions.filter((v) => shown.has(v.id)).map(({ id, designId, src, width, height, mode, style, light, at }) => ({ id, designId, src, width, height, mode, style, light, at })),
    })),
  }
}

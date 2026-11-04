import { fetchWithTimeout } from './http.js'

// Real assessor parcel geometry (doc 07, rule 3): never an estimated rectangle.
// Public keyless ArcGIS layers, queried by the geocoded point. Add counties here.
const PROVIDERS = [
  {
    match: (a) => a.state === 'CA' && /^Orange County$/i.test(a.county),
    county: 'Orange County',
    url: 'https://www.ocgis.com/arcpub/rest/services/Map_Layers/Parcels/MapServer/0/query',
    apnField: 'ASSESSMENT_NO',
    addressField: 'SITE_ADDRESS',
  },
]

// Shoelace area on a local equirectangular projection — accurate to well under 1%
// at parcel scale, which is what the lot-size reconciliation needs.
export function ringAreaSqft(ring) {
  if (ring.length < 3) return 0
  const lat0 = ring.reduce((s, p) => s + p[0], 0) / ring.length
  const mlat = 111132.92 - 559.82 * Math.cos((2 * lat0 * Math.PI) / 180)
  const mlon = 111412.84 * Math.cos((lat0 * Math.PI) / 180)
  let a = 0
  for (let i = 0; i < ring.length; i++) {
    const [y1, x1] = ring[i]
    const [y2, x2] = ring[(i + 1) % ring.length]
    a += x1 * mlon * (y2 * mlat) - x2 * mlon * (y1 * mlat)
  }
  return Math.abs(a / 2) * 10.7639
}

export async function parcelFor(addr) {
  const p = PROVIDERS.find((x) => x.match(addr))
  if (!p) return null
  const q = new URLSearchParams({
    geometry: `${addr.lng},${addr.lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: `${p.apnField},${p.addressField}`,
    returnGeometry: 'true',
    outSR: '4326',
    f: 'json',
  })
  try {
    const r = await fetchWithTimeout(`${p.url}?${q}`, {}, 12000)
    if (!r.ok) return null
    const d = await r.json()
    const f = d.features?.[0]
    if (!f?.geometry?.rings?.length) return null
    // Esri rings are [x=lng, y=lat]; stored as [lat, lng] (PropertyMap flips them for Mapbox).
    const rings = f.geometry.rings.map((ring) => ring.map(([x, y]) => [y, x]))
    const areaSqft = Math.round(rings.reduce((s, ring) => s + ringAreaSqft(ring), 0))
    return {
      county: p.county,
      apn: f.attributes?.[p.apnField] || null,
      siteAddress: f.attributes?.[p.addressField] || null,
      rings,
      areaSqft,
      source: `${p.county} assessor GIS`,
    }
  } catch {
    return null
  }
}

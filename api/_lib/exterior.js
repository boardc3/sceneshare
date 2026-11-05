import { config } from './config.js'
import { bearing } from './mapbox.js'
import { fetchWithTimeout } from './http.js'

// The outside of every listing (Chris, 2026-11-05: "all listings need exterior").
//  - Google Street View: the street-facing view, aimed at the house from the nearest
//    outdoor panorama, credited to Google. Processed like other photos by the owner's
//    choice (Google's terms restrict editing its imagery; STREET_VIEW_EDIT=0 stops it).
//  - Mapbox satellite: an aerial of the lot, as a fallback when Street View has no
//    coverage. Also shown as is, with Mapbox's attribution.
// The editable exterior is a listing photo or the owner's own shot, which go through
// "Make it professional" like every other photo.

export async function streetView(addr) {
  const key = config.googleMapsKey
  if (!key || addr?.lat == null || addr?.lng == null) return { ok: false, reason: key ? 'no_location' : 'no_key' }
  const loc = `${addr.lat},${addr.lng}`
  try {
    const m = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/streetview/metadata?${new URLSearchParams({ location: loc, source: 'outdoor', radius: '80', key })}`, {}, 8000)
    const meta = m.ok ? await m.json() : null
    if (meta?.status !== 'OK' || !meta.location) return { ok: false, reason: `metadata_${String(meta?.status || m.status).toLowerCase()}` }
    // Face the house from where the panorama was taken.
    const heading = Math.round(bearing({ lat: meta.location.lat, lng: meta.location.lng }, { lat: addr.lat, lng: addr.lng }))
    const params = new URLSearchParams({ size: '640x480', scale: '2', pano: meta.pano_id, heading: String(heading), fov: '75', pitch: '6', return_error_code: 'true', key })
    const r = await fetchWithTimeout(`https://maps.googleapis.com/maps/api/streetview?${params}`, {}, 12000)
    if (!r.ok) return { ok: false, reason: `image_${r.status}` }
    const buffer = Buffer.from(await r.arrayBuffer())
    if (buffer.length < 4000) return { ok: false, reason: 'image_empty' }
    return { ok: true, buffer, date: meta.date || null, panoId: meta.pano_id, heading, copyright: meta.copyright || '© Google' }
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'network' }
  }
}

export async function aerial(addr) {
  const token = config.mapboxToken
  if (!token || addr?.lat == null || addr?.lng == null) return { ok: false, reason: token ? 'no_location' : 'no_key' }
  const url = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${addr.lng},${addr.lat},19.2,0/640x480@2x?${new URLSearchParams({ access_token: token, logo: 'true', attribution: 'true' })}`
  try {
    const r = await fetchWithTimeout(url, {}, 12000)
    if (!r.ok) return { ok: false, reason: `image_${r.status}` }
    const buffer = Buffer.from(await r.arrayBuffer())
    return buffer.length > 4000 ? { ok: true, buffer } : { ok: false, reason: 'image_empty' }
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'timeout' : 'network' }
  }
}

// Imagery that must be shown as captured, never edited by the model.
export const LOCKED_SOURCES = ['streetview', 'aerial']
export const isLocked = (photo) => LOCKED_SOURCES.includes(photo?.source) && !(photo.source === 'streetview' && config.streetViewEdit)

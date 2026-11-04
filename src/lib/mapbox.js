import { health } from './api.js'

// Mapbox GL JS, loaded on demand (its own chunk) the first time a map is about to
// show. The public token comes from /api/health, so changing it in Vercel needs no
// rebuild. Chris, 2026-11-04: Mapbox replaces Leaflet/Esri and Google Maps.

let loading = null

export const STYLES = {
  hero: 'mapbox://styles/mapbox/satellite-v9',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  street: 'mapbox://styles/mapbox/streets-v12',
}

export function loadMapbox() {
  if (loading) return loading
  loading = (async () => {
    const h = await health()
    const token = h.mapboxToken || import.meta.env.VITE_MAPBOX_TOKEN
    if (!token) throw new Error('no_mapbox_token')
    const [{ default: mapboxgl }] = await Promise.all([import('mapbox-gl'), import('mapbox-gl/dist/mapbox-gl.css')])
    mapboxgl.accessToken = token
    return mapboxgl
  })().catch((e) => {
    loading = null
    throw e
  })
  return loading
}

// Run `cb` once the element is near the viewport, so map tiles never load on page load.
export function whenVisible(el, cb) {
  if (!('IntersectionObserver' in window)) {
    cb()
    return () => {}
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect()
        cb()
      }
    },
    { rootMargin: '200px' },
  )
  io.observe(el)
  return () => io.disconnect()
}

// Small DOM helpers for markers and popups — text goes in as text, never as HTML.
export function pinElement(className) {
  const el = document.createElement('div')
  el.className = className
  el.appendChild(document.createElement('span'))
  return el
}

export function popupContent(title, body) {
  const wrap = document.createElement('div')
  const strong = document.createElement('strong')
  strong.textContent = title
  wrap.appendChild(strong)
  if (body) {
    wrap.appendChild(document.createElement('br'))
    wrap.appendChild(document.createTextNode(body))
  }
  return wrap
}

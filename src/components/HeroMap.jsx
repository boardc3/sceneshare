import { useEffect, useRef } from 'react'
import { loadMapbox, pinElement, STYLES } from '../lib/mapbox.js'

// The landing hero is a live Mapbox satellite map, not a video or a stock photo.
// It sits still until the visitor picks an address, then flies down to that home
// and tilts toward it — the one orchestrated motion on the page. Mapbox skips the
// animation for visitors who prefer reduced motion (essential: false).
const START = { center: [-117.7854, 33.5427], zoom: 15.2 } // Laguna Beach shoreline

export default function HeroMap({ target }) {
  const box = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const gl = useRef(null)

  useEffect(() => {
    let alive = true
    loadMapbox()
      .then((mapboxgl) => {
        if (!alive || !box.current || map.current) return
        gl.current = mapboxgl
        map.current = new mapboxgl.Map({
          container: box.current,
          style: STYLES.hero,
          center: START.center,
          zoom: START.zoom,
          interactive: false,
          attributionControl: false,
          fadeDuration: 0,
        })
        // Mapbox's logo and attribution are required by its terms; keep them visible.
        map.current.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')
      })
      .catch(() => {
        /* no token yet: the dusk background stands in */
      })
    return () => {
      alive = false
      map.current?.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const m = map.current
    const mapboxgl = gl.current
    if (!m || !mapboxgl || !target) return
    const dest = [target.lng, target.lat]
    m.flyTo({ center: dest, zoom: 18, pitch: 52, bearing: -18, duration: 2600, curve: 1.6, essential: false })
    marker.current?.remove()
    marker.current = new mapboxgl.Marker({ element: pinElement('pin pin--home pin--hero') }).setLngLat(dest).addTo(m)
  }, [target])

  return (
    <div className="hero__map" aria-hidden="true">
      <div className="hero__mapgl" ref={box} />
    </div>
  )
}

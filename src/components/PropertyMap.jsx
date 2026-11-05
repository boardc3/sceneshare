import { useEffect, useMemo, useRef, useState } from 'react'
import { compass, useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { loadMapbox, pinElement, STYLES, whenVisible } from '../lib/mapbox.js'
import { POI_ICONS } from '../lib/poiIcons.js'

function PoiIcon({ kind, size = 16 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={POI_ICONS[kind] || POI_ICONS.home} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const fmt = (n, lang) => Math.round(n).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
const miles = (m) => (m / 1609.34 < 10 ? (m / 1609.34).toFixed(1) : Math.round(m / 1609.34))

// Classes a buyer thinks in (doc 07, rule 4). Older homes carry v1 categories.
export const GROUPS = ['schools', 'outdoors', 'everyday', 'health', 'travel']
const GROUP_OF = { elementary: 'schools', middle: 'schools', high: 'schools', school: 'schools', beach: 'outdoors', park: 'outdoors', grocery: 'everyday', cafe: 'everyday', dining: 'everyday', shopping: 'everyday', hospital: 'health', airport: 'travel', train: 'travel' }
export const groupOf = (p) => p.group || GROUP_OF[p.category] || 'everyday'
const ORDER = ['elementary', 'middle', 'high', 'school', 'park', 'beach', 'grocery', 'cafe', 'dining', 'shopping', 'hospital', 'train', 'airport']

// Rough door-to-door times, labelled "about": walking ~80 m/min; driving ~2 min + 33 km/h.
const walkMin = (m) => Math.round(m / 80)
const driveMin = (m) => Math.max(2, Math.round(2 + m / 550))

// The required interactive map (doc 07), on Mapbox: satellite first with a street
// toggle, the assessor parcel when published (labelled approximate), the places a
// buyer asks about in classes they can filter, a list linked to the markers, and
// three framings — it opens zoomed out on the area.
export default function PropertyMap({ address, parcel, pois = [], lotSqft = null }) {
  const { t, lang } = useI18n()
  const box = useRef(null)
  const mapRef = useRef(null)
  const viewsRef = useRef(null)
  const markersRef = useRef(new Map()) // category -> { marker, el }
  const [base, setBase] = useState('satellite')
  const [view, setView] = useState('area')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState(() => new Set())
  const [active, setActive] = useState(null)

  const places = useMemo(() => [...pois].sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category)), [pois])
  const groups = useMemo(() => GROUPS.filter((g) => places.some((p) => groupOf(p) === g)), [places])

  const detail = (p) => {
    const parts = [`${miles(p.meters)} ${t('unit.mi')} ${t(`dir.${compass(p.bearing)}`)}`]
    if (walkMin(p.meters) <= 25) parts.push(t('map.walk', { n: walkMin(p.meters) }))
    if (p.meters > 600) parts.push(t('map.drive', { n: driveMin(p.meters) }))
    return parts.join(' · ')
  }

  useEffect(() => {
    if (!address || !box.current) return
    let cancelled = false
    const stop = whenVisible(box.current, async () => {
      let mapboxgl
      try {
        mapboxgl = await loadMapbox()
      } catch {
        if (!cancelled) setFailed(true)
        return
      }
      if (cancelled || !box.current) return
      const home = [address.lng, address.lat]
      const map = new mapboxgl.Map({
        container: box.current,
        style: STYLES[base] || STYLES.satellite,
        center: home,
        zoom: 12.5,
        cooperativeGestures: true, // never trap the page scroll (doc 07, rule 6)
        language: lang === 'zh' ? 'zh-Hans' : 'en',
        attributionControl: false,
      })
      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left')
      map.addControl(new mapboxgl.FullscreenControl(), 'top-left')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

      const ring = (r) => r.map(([la, ln]) => [ln, la])
      const parcelGeo = parcel?.rings?.length ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: parcel.rings.map(ring) } } : null
      map.on('style.load', () => {
        if (!parcelGeo || map.getSource('parcel')) return
        map.addSource('parcel', { type: 'geojson', data: parcelGeo })
        map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel', paint: { 'fill-color': '#E8A548', 'fill-opacity': 0.16 } })
        map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcel', paint: { 'line-color': '#E8A548', 'line-width': 2.5 } })
      })

      const popup = (title, name, body) => {
        const wrap = document.createElement('div')
        wrap.className = 'mpop'
        const k = document.createElement('span')
        k.className = 'mpop__k'
        k.textContent = title
        const n = document.createElement('strong')
        n.textContent = name
        wrap.append(k, n)
        if (body) {
          const b = document.createElement('span')
          b.className = 'mpop__b'
          b.textContent = body
          wrap.append(b)
        }
        return wrap
      }

      const homeMarker = new mapboxgl.Marker({ element: pinElement('pin pin--home', 'home', t('map.home')) })
        .setLngLat(home)
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setDOMContent(popup(t('map.home'), address.formatted, parcel ? t('map.parcelLegend') : t('map.pinLegend'))))
        .addTo(map)
      const markers = markersRef.current
      markers.clear()
      markers.set('home', { marker: homeMarker })
      const near = [home]
      const all = [home]
      for (const p of places) {
        const g = groupOf(p)
        const el = pinElement(`pin pin--poi pin--g-${g} pin--${p.category}`, p.category, t(`poi.${p.category}`))
        el.addEventListener('click', () => {
          setActive(p.category)
          track('map_place', { category: p.category, from: 'marker' })
        })
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .setPopup(new mapboxgl.Popup({ offset: 14 }).setDOMContent(popup(t(`poi.${p.category}`), p.name, detail(p))))
          .addTo(map)
        markers.set(p.category, { marker, el })
        all.push([p.lng, p.lat])
        if (g !== 'travel') near.push([p.lng, p.lat])
      }

      const boundsOf = (pts) => pts.reduce((b, pt) => b.extend(pt), new mapboxgl.LngLatBounds(pts[0], pts[0]))
      const parcelPts = parcelGeo ? parcelGeo.geometry.coordinates.flat() : null
      const siteView = () => (parcelPts ? map.fitBounds(boundsOf(parcelPts), { padding: 70, maxZoom: 19.2 }) : map.easeTo({ center: home, zoom: 18 }))
      const areaView = (opts = {}) => (near.length > 1 ? map.fitBounds(boundsOf(near), { padding: 70, maxZoom: 14, ...opts }) : map.easeTo({ center: home, zoom: 13.5, ...opts }))
      const wideView = () => (all.length > 1 ? map.fitBounds(boundsOf(all), { padding: 60, maxZoom: 13 }) : map.easeTo({ center: home, zoom: 11 }))
      viewsRef.current = { siteView, areaView, wideView }
      map.once('load', () => {
        if (cancelled) return
        areaView({ duration: 0 }) // opens zoomed out: the home and everything near it
        setReady(true)
      })
    })
    return () => {
      cancelled = true
      stop()
      markersRef.current.forEach(({ marker }) => marker.remove())
      markersRef.current.clear()
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
    // Rebuild when the language changes so labels and popups follow it.
  }, [address, parcel, places, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  // Filters: hide the markers of switched-off classes.
  useEffect(() => {
    markersRef.current.forEach(({ marker, el }, cat) => {
      if (!el) return
      const p = places.find((x) => x.category === cat)
      const off = p && hidden.has(groupOf(p))
      el.style.display = off ? 'none' : ''
      if (off && marker.getPopup()?.isOpen()) marker.togglePopup()
    })
  }, [hidden, places, ready])

  // Highlight the chosen place on the map.
  useEffect(() => {
    markersRef.current.forEach(({ el }, cat) => el?.classList.toggle('is-active', cat === active))
  }, [active, ready])

  const switchBase = (name) => {
    const map = mapRef.current
    if (!map || name === base) return
    map.setStyle(STYLES[name]) // 'style.load' re-adds the parcel layers
    setBase(name)
  }
  const frame = (v) => {
    viewsRef.current?.[v === 'parcel' ? 'siteView' : v === 'wide' ? 'wideView' : 'areaView']()
    setView(v)
    track('map_view', { view: v })
  }
  const toggleGroup = (g) => {
    setHidden((h) => {
      const n = new Set(h)
      n.has(g) ? n.delete(g) : n.add(g)
      return n
    })
    track('map_filter', { group: g })
  }
  const showAll = () => setHidden(new Set())
  const focus = (p) => {
    const map = mapRef.current
    const m = markersRef.current.get(p.category)
    if (!map || !m) return
    if (hidden.has(groupOf(p))) setHidden((h) => new Set([...h].filter((g) => g !== groupOf(p))))
    markersRef.current.forEach(({ marker }) => marker.getPopup()?.isOpen() && marker.togglePopup())
    map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14.5), essential: true })
    m.marker.togglePopup()
    setActive(p.category)
    box.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
    track('map_place', { category: p.category, from: 'list' })
  }

  const diff = parcel?.areaSqft && lotSqft ? Math.abs(parcel.areaSqft - lotSqft) / lotSqft : null

  return (
    <section className="location" aria-labelledby="loc-h" data-section="map">
      <div className="location__head">
        <h2 id="loc-h">{t('map.title')}</h2>
        <div className="location__controls" role="group" aria-label={t('map.title')}>
          <div className="seg">
            <button type="button" aria-pressed={base === 'satellite'} onClick={() => switchBase('satellite')} disabled={!ready}>
              {t('map.satellite')}
            </button>
            <button type="button" aria-pressed={base === 'street'} onClick={() => switchBase('street')} disabled={!ready}>
              {t('map.street')}
            </button>
          </div>
          <div className="seg">
            {places.some((p) => groupOf(p) === 'travel') && (
              <button type="button" aria-pressed={view === 'wide'} onClick={() => frame('wide')} disabled={!ready}>
                {t('map.wide')}
              </button>
            )}
            <button type="button" aria-pressed={view === 'area'} onClick={() => frame('area')} disabled={!ready}>
              {t('map.area')}
            </button>
            <button type="button" aria-pressed={view === 'parcel'} onClick={() => frame('parcel')} disabled={!ready}>
              {t('map.parcel')}
            </button>
          </div>
        </div>
      </div>

      {groups.length > 1 && (
        <div className="mapchips" role="group" aria-label={t('map.filter')}>
          <button type="button" className="mapchip" aria-pressed={hidden.size === 0} onClick={showAll}>
            {t('map.all')}
          </button>
          {groups.map((g) => (
            <button key={g} type="button" className={`mapchip mapchip--${g}`} aria-pressed={!hidden.has(g)} onClick={() => toggleGroup(g)}>
              <span className={`mapchip__dot pin--g-${g}`} aria-hidden="true" />
              {t(`map.group.${g}`)}
            </button>
          ))}
        </div>
      )}

      <div className="location__body">
        <div className="map" id="map" role="region" aria-label={t('map.title')}>
          <div className="map__gl" ref={box} />
          {!ready && <p className="map__loading">{failed ? t('map.unavailable') : t('map.loading')}</p>}
        </div>

        {places.length > 0 && (
          <aside className="places" aria-label={t('map.places')}>
            <p className="places__home">
              <span className="dot dot--home" aria-hidden="true">
                <PoiIcon kind="home" />
              </span>
              <span>
                <strong>{t('map.home')}</strong>
                <span className="places__sub">{parcel ? t('map.parcelLegend') : t('map.pinLegend')}</span>
              </span>
            </p>
            {groups.map((g) => (
              <div key={g} className={`places__group ${hidden.has(g) ? 'is-off' : ''}`}>
                <h3>{t(`map.group.${g}`)}</h3>
                <ul>
                  {places
                    .filter((p) => groupOf(p) === g)
                    .map((p) => (
                      <li key={p.category}>
                        <button type="button" className={`place ${active === p.category ? 'is-active' : ''}`} onClick={() => focus(p)} disabled={!ready}>
                          <span className={`dot pin--g-${g} dot--${p.category}`} aria-hidden="true">
                            <PoiIcon kind={p.category} />
                          </span>
                          <span className="place__txt">
                            <span className="place__cat">{t(`poi.${p.category}`)}</span>
                            <span className="place__name">{p.name}</span>
                            <span className="place__det">{detail(p)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
            <p className="places__hint">{t('map.hint')}</p>
          </aside>
        )}
      </div>

      <p className="location__note">
        {parcel ? t('map.parcelNote', { county: parcel.county, apn: parcel.apn || '—' }) : t('map.pinNote')}
        {diff !== null && <> {t('map.reconcile', { parcel: fmt(parcel.areaSqft, lang), lot: fmt(lotSqft, lang), diff: (diff * 100).toFixed(1) })}</>} {t('map.timesNote')}
      </p>
    </section>
  )
}

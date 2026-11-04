import { useEffect, useRef, useState } from 'react'
import { compass, useI18n } from '../i18n.js'
import { loadMapbox, pinElement, popupContent, STYLES, whenVisible } from '../lib/mapbox.js'
import { POI_ICONS } from '../lib/poiIcons.js'
import { track } from '../lib/analytics.js'

function PoiIcon({ kind }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d={POI_ICONS[kind] || POI_ICONS.home} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const fmt = (n, lang) => Math.round(n).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
const miles = (m) => (m / 1609.34 < 10 ? (m / 1609.34).toFixed(1) : Math.round(m / 1609.34))

// The required interactive map (doc 07), on Mapbox: satellite first with a street
// toggle, real assessor parcel geometry when published, the places a buyer asks
// about (each with its own icon), and two framings — it opens on the area, with
// the parcel one tap away.
export default function PropertyMap({ address, parcel, pois = [], lotSqft = null }) {
  const { t, lang } = useI18n()
  const box = useRef(null)
  const mapRef = useRef(null)
  const viewsRef = useRef(null)
  const [base, setBase] = useState('satellite')
  const [view, setView] = useState('area')
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!address || !box.current) return
    let cancelled = false
    const markers = []
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
        zoom: 14,
        cooperativeGestures: true, // never trap the page scroll (doc 07, rule 6)
        language: lang === 'zh' ? 'zh-Hans' : 'en',
        attributionControl: false,
      })
      mapRef.current = map
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left')
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-right')

      // Parcel: GeoJSON layers have to be re-added whenever the style changes.
      const ring = (r) => r.map(([la, ln]) => [ln, la])
      const parcelGeo = parcel?.rings?.length
        ? { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: parcel.rings.map(ring) } }
        : null
      map.on('style.load', () => {
        if (!parcelGeo || map.getSource('parcel')) return
        map.addSource('parcel', { type: 'geojson', data: parcelGeo })
        map.addLayer({ id: 'parcel-fill', type: 'fill', source: 'parcel', paint: { 'fill-color': '#E8A548', 'fill-opacity': 0.16 } })
        map.addLayer({ id: 'parcel-line', type: 'line', source: 'parcel', paint: { 'line-color': '#E8A548', 'line-width': 2.5 } })
      })

      markers.push(
        new mapboxgl.Marker({ element: pinElement('pin pin--home', 'home', t('map.home')) })
          .setLngLat(home)
          .setPopup(new mapboxgl.Popup({ offset: 16 }).setDOMContent(popupContent(t('map.home'), address.formatted)))
          .addTo(map),
      )
      const all = [home]
      for (const p of pois) {
        const sentence = t('map.poi', { name: p.name, dist: `${miles(p.meters)} ${t('unit.mi')}`, dir: t(`dir.${compass(p.bearing)}`) })
        markers.push(
          new mapboxgl.Marker({ element: pinElement(`pin pin--poi pin--${p.category}`, p.category, t(`poi.${p.category}`)) })
            .setLngLat([p.lng, p.lat])
            .setPopup(new mapboxgl.Popup({ offset: 10 }).setDOMContent(popupContent(t(`poi.${p.category}`), sentence)))
            .addTo(map),
        )
        // The airport is context, not neighbourhood: keep it out of "the area" framing.
        if (p.category !== 'airport') all.push([p.lng, p.lat])
      }

      const boundsOf = (pts) => pts.reduce((b, pt) => b.extend(pt), new mapboxgl.LngLatBounds(pts[0], pts[0]))
      const parcelPts = parcelGeo ? parcelGeo.geometry.coordinates.flat() : null
      const siteView = () =>
        parcelPts ? map.fitBounds(boundsOf(parcelPts), { padding: 70, maxZoom: 19.2, essential: false }) : map.easeTo({ center: home, zoom: 18, essential: false })
      const areaView = () =>
        all.length > 1 ? map.fitBounds(boundsOf(all), { padding: 50, maxZoom: 15.5, essential: false }) : map.easeTo({ center: home, zoom: 14, essential: false })
      viewsRef.current = { siteView, areaView }
      map.once('load', () => {
        if (cancelled) return
        // Open on the area: the home and the places around it, all in view.
        if (all.length > 1) map.fitBounds(boundsOf(all), { padding: 56, maxZoom: 15.5, duration: 0 })
        setReady(true)
      })
    })
    return () => {
      cancelled = true
      stop()
      markers.forEach((m) => m.remove())
      mapRef.current?.remove()
      mapRef.current = null
      setReady(false)
    }
    // Rebuild when the language changes so labels and popups follow it.
  }, [address, parcel, pois, lang]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchBase = (name) => {
    const map = mapRef.current
    if (!map || name === base) return
    map.setStyle(STYLES[name]) // 'style.load' re-adds the parcel layers
    setBase(name)
  }

  const diff = parcel?.areaSqft && lotSqft ? Math.abs(parcel.areaSqft - lotSqft) / lotSqft : null

  return (
    <section className="location" aria-labelledby="loc-h">
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
            <button
              type="button"
              aria-pressed={view === 'area'}
              onClick={() => {
                viewsRef.current?.areaView()
                setView('area')
                track('map_view', { view: 'area' })
              }}
              disabled={!ready}
            >
              {t('map.area')}
            </button>
            <button
              type="button"
              aria-pressed={view === 'parcel'}
              onClick={() => {
                viewsRef.current?.siteView()
                setView('parcel')
                track('map_view', { view: 'parcel' })
              }}
              disabled={!ready}
            >
              {t('map.parcel')}
            </button>
          </div>
        </div>
      </div>
      <div className="map" id="map" role="region" aria-label={t('map.title')}>
        <div className="map__gl" ref={box} />
        {!ready && <p className="map__loading">{failed ? t('map.unavailable') : t('map.loading')}</p>}
      </div>
      <div className="location__legend">
        <span className="key key--home">
          <span className="dot dot--home" aria-hidden="true">
            <PoiIcon kind="home" />
          </span>
          {t('map.home')}
          {parcel ? ` · ${t('map.parcelLegend')}` : ''}
        </span>
        {pois.length > 0 && (
          <ul className="poi-list">
            {pois.map((p) => (
              <li key={p.category}>
                <span className={`dot dot--${p.category}`} aria-hidden="true">
                  <PoiIcon kind={p.category} />
                </span>
                <span className="poi-list__txt">
                  <span className="poi-list__cat">{t(`poi.${p.category}`)}</span>
                  <span className="poi-list__name">{p.name}</span>
                </span>
                <span className="poi-list__dist">
                  {miles(p.meters)} {t('unit.mi')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="location__note">
        {parcel ? t('map.parcelNote', { county: parcel.county, apn: parcel.apn || '—' }) : t('map.pinNote')}
        {diff !== null && <> {t('map.reconcile', { parcel: fmt(parcel.areaSqft, lang), lot: fmt(lotSqft, lang), diff: (diff * 100).toFixed(1) })}</>}
      </p>
    </section>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { health } from '../lib/api.js'

// The homepage's "what Sceneshare is for" film: from orbit down to one home in
// Irvine, the home's potential, then its numbers and its neighbourhood — the
// whole remote-buyer story in one stage. Video by Higgsfield; the stats and the
// map are live page elements so they stay sharp and real.

// Illustrative home in Woodbridge, Irvine, with real nearby places (Mapbox, 2026-11-04).
const HOME = { lng: -117.788, lat: 33.688 }
const PLACES = [
  { key: 'school', name: 'Deerfield Elementary School', lng: -117.79123, lat: 33.69373 },
  { key: 'school', name: 'Woodbridge High School', lng: -117.80672, lat: 33.67839 },
  { key: 'park', name: 'Deerfield Community Park', lng: -117.79298, lat: 33.69026 },
  { key: 'lake', name: 'North Lake, Woodbridge', lng: -117.79488, lat: 33.68087 },
  { key: 'grocery', name: '99 Ranch Market', lng: -117.79827, lat: 33.6964 },
  { key: 'shop', name: 'Woodbridge Village Center', lng: -117.79953, lat: 33.67739 },
]
const FAR = [
  { key: 'shop', name: 'Irvine Spectrum', lng: -117.74704, lat: 33.65129 },
  { key: 'airport', name: 'John Wayne Airport', lng: -117.86289, lat: 33.67733 },
  { key: 'school', name: 'UC Irvine', lng: -117.84931, lat: 33.62723 },
]
const PIN = { school: 'college', park: 'park', lake: 'water', grocery: 'grocery', shop: 'shop', airport: 'airport' }

const toRad = (d) => (d * Math.PI) / 180
function km(a, b) {
  const R = 6371
  const s = Math.sin(toRad(b.lat - a.lat) / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(toRad(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}
const miles = (k) => k * 0.621371

function staticMap(token) {
  const pins = [`pin-l-building+e8a548(${HOME.lng},${HOME.lat})`, ...PLACES.map((p, i) => `pin-s-${i + 1}+16212b(${p.lng},${p.lat})`)].join(',')
  return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${pins}/auto/1280x720@2x?padding=90,120,90,120&logo=false&access_token=${encodeURIComponent(token)}`
}

const STAGES = ['anywhere', 'potential', 'numbers', 'place']
// Seconds into the film where the dive from orbit hands over to the renovation.
const SPLIT = 8

export default function Story() {
  const { t, lang } = useI18n()
  const box = useRef(null)
  const video = useRef(null)
  const [stage, setStage] = useState('anywhere')
  const [mapUrl, setMapUrl] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [started, setStarted] = useState(false)
  const timers = useRef([])
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  // The map image only once the section is near the screen.
  useEffect(() => {
    if (!box.current) return
    const io = new IntersectionObserver(
      (e) => {
        if (!e.some((x) => x.isIntersecting)) return
        io.disconnect()
        health().then((h) => h.mapboxToken && setMapUrl(staticMap(h.mapboxToken)))
      },
      { rootMargin: '400px' },
    )
    io.observe(box.current)
    return () => io.disconnect()
  }, [])

  // Autoplay (muted) when the stage is on screen; reduced motion shows the end state.
  useEffect(() => {
    if (!box.current) return
    if (reduce) {
      setStage('numbers')
      return
    }
    const io = new IntersectionObserver(
      (e) => {
        const v = video.current
        if (!v) return
        if (e.some((x) => x.isIntersecting)) {
          if (!started && stage !== 'place') {
            v.play().then(() => setStarted(true)).catch(() => {})
          }
        } else if (!v.paused) v.pause()
      },
      { threshold: 0.5 },
    )
    io.observe(box.current)
    return () => io.disconnect()
  }, [reduce, started, stage])

  useEffect(() => clear, [])

  const onTime = () => {
    const v = video.current
    if (!v || !v.duration) return
    const next = v.currentTime < SPLIT - 0.4 ? 'anywhere' : 'potential'
    if (next !== stage && (stage === 'anywhere' || stage === 'potential')) setStage(next)
  }
  const onEnded = () => {
    setStage('numbers')
    track('story_watched')
    clear()
    timers.current.push(setTimeout(() => setStage('place'), 5200))
  }
  const replay = () => {
    clear()
    setStage('anywhere')
    const v = video.current
    if (v) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
    track('story_replay')
  }
  const jump = (s) => {
    clear()
    const v = video.current
    if (s === 'anywhere' || s === 'potential') {
      if (v) {
        v.currentTime = s === 'anywhere' ? 0 : SPLIT
        v.play().catch(() => {})
      }
    } else v?.pause()
    setStage(s)
  }

  const facts = [
    ['4', t('story.f.beds')],
    ['3', t('story.f.baths')],
    ['2,180', t('story.f.sqft')],
    ['6,000', t('story.f.lot')],
    ['1979', t('story.f.built')],
    [lang === 'zh' ? '0.7 公里' : '0.4 mi', t('story.f.school')],
  ]
  const nearest = [...PLACES, ...FAR].map((p) => ({ ...p, d: km(HOME, p) }))
  const dist = (d) => (lang === 'zh' ? `${d.toFixed(1)} 公里` : `${miles(d).toFixed(1)} mi`)
  const showFilm = stage === 'anywhere' || stage === 'potential'

  return (
    <section className="story" aria-labelledby="story-h" ref={box}>
      <div className="story__text">
        <p className="story__eyebrow">{t('story.eyebrow')}</p>
        <h2 id="story-h">{t('story.title')}</h2>
        <p className="story__lede">{t('story.lede')}</p>
      </div>

      <div className={`story__stage story__stage--${stage}`}>
        <video
          ref={video}
          className="story__video"
          src="/media/story.mp4"
          poster="/media/story-poster.jpg"
          muted
          playsInline
          preload="metadata"
          onTimeUpdate={onTime}
          onEnded={onEnded}
          aria-label={t('story.videoLabel')}
        />
        <p className={`story__cap ${showFilm ? 'is-on' : ''}`} aria-live="polite">
          {stage === 'anywhere' ? t('story.cap.anywhere') : stage === 'potential' ? t('story.cap.potential') : ''}
        </p>

        <img className={`story__still ${stage === 'numbers' ? 'is-on' : ''}`} src="/media/story-end.jpg" alt="" aria-hidden="true" loading="lazy" />
        <div className={`story__facts ${stage === 'numbers' ? 'is-on' : ''}`} aria-hidden={stage !== 'numbers'}>
          <p className="story__where">{t('story.where')}</p>
          <ul>
            {facts.map(([n, l], i) => (
              <li key={l} style={{ '--i': i }}>
                <strong>{n}</strong>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className={`story__map ${stage === 'place' ? 'is-on' : ''}`} aria-hidden={stage !== 'place'}>
          {mapUrl && <img src={mapUrl} alt={t('story.mapAlt')} onLoad={() => setMapReady(true)} className={mapReady ? 'is-ready' : ''} />}
          <ol className="story__places">
            {nearest.map((p, i) => (
              <li key={p.name} style={{ '--i': i }} className={i >= PLACES.length ? 'story__far' : ''}>
                {i < PLACES.length && <span className="story__pin">{i + 1}</span>}
                <span className={`story__ico story__ico--${PIN[p.key]}`} aria-hidden="true" />
                <span className="story__pname">{p.name}</span>
                <span className="story__pd">{dist(p.d)}</span>
              </li>
            ))}
          </ol>
        </div>

        {(stage === 'place' || (stage === 'numbers' && !reduce)) && (
          <button type="button" className="story__replay" onClick={replay}>
            ↺ {t('story.replay')}
          </button>
        )}
        {reduce && stage === 'numbers' && (
          <button type="button" className="story__replay" onClick={replay}>
            ▶ {t('story.play')}
          </button>
        )}
        <p className="story__note">{t('story.note')}</p>
      </div>

      <ol className="story__steps" aria-label={t('story.stepsLabel')}>
        {STAGES.map((s, i) => (
          <li key={s}>
            <button type="button" aria-current={stage === s ? 'step' : undefined} onClick={() => jump(s)}>
              <span className="story__n">{i + 1}</span>
              {t(`story.step.${s}`)}
            </button>
          </li>
        ))}
      </ol>

      <ul className="offer">
        {['photos', 'link', 'place', 'insight', 'potential', 'compliant'].map((k) => (
          <li key={k} className={`offer__item offer__item--${k}`}>
            <h3>{t(`offer.${k}.t`)}</h3>
            <p>{t(`offer.${k}.b`)}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

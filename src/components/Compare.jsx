import { useCallback, useEffect, useRef, useState } from 'react'

// Before/after slider. The box takes its aspect ratio from the source photo's own
// pixels (aspect ratio is law — doc 08, rule 2b); both images are `contain`ed in
// that box, so nothing is ever stretched or cropped differently from the other.
export default function Compare({ before, after, width, height, beforeLabel, afterLabel, alt = '', start = 50, intro = false }) {
  const box = useRef(null)
  const [pos, setPos] = useState(intro ? 96 : start)
  const [ratio, setRatio] = useState(width && height ? `${width} / ${height}` : null)
  const dragging = useRef(false)
  const touched = useRef(false)
  // Clear loading state until both pictures have actually arrived.
  const [loaded, setLoaded] = useState({})
  const beforeRef = useRef(null)
  const afterRef = useRef(null)
  useEffect(() => {
    const done = (el) => Boolean(el?.complete && el.naturalWidth)
    setLoaded({ before: done(beforeRef.current), after: done(afterRef.current) })
  }, [before, after])
  const mark = (k) => setLoaded((l) => ({ ...l, [k]: true }))
  const ready = loaded.before && (!after || loaded.after)
  const Loading = () =>
    ready ? null : (
      <div className="compare__loading" role="status" aria-live="polite">
        <span className="spinner" aria-hidden="true" />
        <span className="sr-only">Loading</span>
      </div>
    )

  // Intro: once the slider scrolls into view, sweep from "as photographed" across to
  // the proposal and settle in the middle — the transformation, shown without a click.
  useEffect(() => {
    if (!intro || !after || !box.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setPos(start)
      return
    }
    let raf = 0
    let t0 = 0
    const keys = [
      [0, 96],
      [700, 96],
      [2300, 4],
      [3100, 4],
      [4100, start],
    ]
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
    const tick = (now) => {
      if (touched.current) return
      if (!t0) t0 = now
      const t = now - t0
      let i = keys.findIndex((k) => k[0] > t)
      if (i === -1) return setPos(start)
      const [ta, pa] = keys[i - 1]
      const [tb, pb] = keys[i]
      setPos(pa + (pb - pa) * ease((t - ta) / (tb - ta)))
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          raf = requestAnimationFrame(tick)
        }
      },
      { threshold: 0.45 },
    )
    io.observe(box.current)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [intro, after, start])

  useEffect(() => {
    if (width && height) setRatio(`${width} / ${height}`)
  }, [width, height])

  const onLoad = (e) => {
    mark('before')
    if (!width || !height) setRatio(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`)
  }

  const moveTo = useCallback((clientX) => {
    touched.current = true
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }, [])

  useEffect(() => {
    const up = () => (dragging.current = false)
    const move = (e) => dragging.current && moveTo(e.touches ? e.touches[0].clientX : e.clientX)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointermove', move)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointermove', move)
    }
  }, [moveTo])

  const onKey = (e) => {
    touched.current = true
    if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5))
    if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5))
    if (e.key === 'Home') setPos(0)
    if (e.key === 'End') setPos(100)
  }

  if (!after) {
    return (
      <figure className={`compare compare--single ${ready ? '' : 'compare--loading'}`} style={ratio ? { aspectRatio: ratio } : undefined}>
        <img ref={beforeRef} src={before} alt={alt} onLoad={onLoad} onError={() => mark('before')} draggable="false" />
        <Loading />
        {beforeLabel && <figcaption className="compare__tag compare__tag--left">{beforeLabel}</figcaption>}
      </figure>
    )
  }

  return (
    <figure
      className={`compare ${ready ? '' : 'compare--loading'}`}
      ref={box}
      style={ratio ? { aspectRatio: ratio, '--pos': `${pos}%` } : { '--pos': `${pos}%` }}
      onPointerDown={(e) => {
        dragging.current = true
        moveTo(e.clientX)
      }}
    >
      <img ref={afterRef} className="compare__after" src={after} alt={afterLabel ? `${alt} — ${afterLabel}` : alt} onLoad={() => mark('after')} onError={() => mark('after')} draggable="false" />
      <div className="compare__before">
        <img ref={beforeRef} src={before} alt={beforeLabel ? `${alt} — ${beforeLabel}` : alt} onLoad={onLoad} onError={() => mark('before')} draggable="false" />
      </div>
      <Loading />
      <div
        className="compare__handle"
        role="slider"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        aria-label={`${beforeLabel} / ${afterLabel}`}
        onKeyDown={onKey}
      >
        <span aria-hidden="true" />
      </div>
      <figcaption>
        <span className="compare__tag compare__tag--left">{beforeLabel}</span>
        <span className="compare__tag compare__tag--right">{afterLabel}</span>
      </figcaption>
    </figure>
  )
}

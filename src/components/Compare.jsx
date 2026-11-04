import { useCallback, useEffect, useRef, useState } from 'react'

// Before/after slider. The box takes its aspect ratio from the source photo's own
// pixels (aspect ratio is law — doc 08, rule 2b); both images are `contain`ed in
// that box, so nothing is ever stretched or cropped differently from the other.
export default function Compare({ before, after, width, height, beforeLabel, afterLabel, alt = '', start = 50 }) {
  const box = useRef(null)
  const [pos, setPos] = useState(start)
  const [ratio, setRatio] = useState(width && height ? `${width} / ${height}` : null)
  const dragging = useRef(false)

  useEffect(() => {
    if (width && height) setRatio(`${width} / ${height}`)
  }, [width, height])

  const onLoad = (e) => {
    if (!width || !height) setRatio(`${e.currentTarget.naturalWidth} / ${e.currentTarget.naturalHeight}`)
  }

  const moveTo = useCallback((clientX) => {
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
    if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 5))
    if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 5))
    if (e.key === 'Home') setPos(0)
    if (e.key === 'End') setPos(100)
  }

  if (!after) {
    return (
      <figure className="compare compare--single" style={ratio ? { aspectRatio: ratio } : undefined}>
        <img src={before} alt={alt} onLoad={onLoad} draggable="false" />
        {beforeLabel && <figcaption className="compare__tag compare__tag--left">{beforeLabel}</figcaption>}
      </figure>
    )
  }

  return (
    <figure
      className="compare"
      ref={box}
      style={ratio ? { aspectRatio: ratio, '--pos': `${pos}%` } : { '--pos': `${pos}%` }}
      onPointerDown={(e) => {
        dragging.current = true
        moveTo(e.clientX)
      }}
    >
      <img className="compare__after" src={after} alt={afterLabel ? `${alt} — ${afterLabel}` : alt} draggable="false" />
      <div className="compare__before">
        <img src={before} alt={beforeLabel ? `${alt} — ${beforeLabel}` : alt} onLoad={onLoad} draggable="false" />
      </div>
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

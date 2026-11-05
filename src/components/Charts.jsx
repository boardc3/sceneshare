import { useId, useRef, useState } from 'react'

// Small chart pieces shared by /admin and the owners' analytics page. Every chart
// is a single series in one hue (validated: --chart-ink #b8791f passes contrast and
// lightness against the light surface), so its title names it and no legend is
// needed; tooltips enhance, and each page also offers its numbers as a table.

export const fmtNum = (n, lang = 'en') => Number(n || 0).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
export const fmtDuration = (ms, lang = 'en') => {
  const s = Math.round((ms || 0) / 1000)
  if (lang === 'zh') return s < 60 ? `${s} 秒` : `${Math.floor(s / 60)} 分 ${s % 60} 秒`
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
export const fmtDay = (d, { long = false, lang = 'en' } = {}) =>
  new Date(`${d}T12:00:00`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', long ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' })

// "▲ 12% vs previous" — direction is in the arrow and the words, not color alone.
export function Delta({ now, before, words = {} }) {
  const w = { none: 'no change', fresh: 'new this period', same: 'same as before', vs: 'vs previous', ...words }
  if (!before && !now) return <span className="an-delta">{w.none}</span>
  if (!before) return <span className="an-delta an-delta--up">{w.fresh}</span>
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0) return <span className="an-delta">{w.same}</span>
  return (
    <span className={`an-delta ${pct > 0 ? 'an-delta--up' : 'an-delta--down'}`}>
      {pct > 0 ? '▲' : '▼'} {Math.abs(pct)}% <span className="an-delta__vs">{w.vs}</span>
    </span>
  )
}

// A single-series daily chart: 2px line over a faint area, 3 recessive gridlines,
// crosshair + tooltip on hover, arrow keys on focus. `total` overrides the header
// figure (e.g. "accounts" is a running total, not a sum).
export function Trend({ title, data, field, lang = 'en', total = null }) {
  const W = 320
  const H = 132
  const pad = { l: 30, r: 8, t: 10, b: 20 }
  const [hover, setHover] = useState(null)
  const svg = useRef(null)
  const id = useId()
  const vals = data.map((d) => d[field] || 0)
  const max = Math.max(1, ...vals)
  const nice = max <= 4 ? 4 : Math.ceil(max / 4) * 4
  const x = (i) => pad.l + (data.length <= 1 ? 0 : (i / (data.length - 1)) * (W - pad.l - pad.r))
  const y = (v) => pad.t + (1 - v / nice) * (H - pad.t - pad.b)
  const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = `${line}L${x(vals.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z`
  const sum = total ?? vals.reduce((a, b) => a + b, 0)
  const pick = (clientX) => {
    const r = svg.current.getBoundingClientRect()
    const px = ((clientX - r.left) / r.width) * W
    const i = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (data.length - 1))
    setHover(Math.max(0, Math.min(data.length - 1, i)))
  }
  const ticks = [0, nice / 2, nice]
  const labelIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1].filter((v, i, a) => a.indexOf(v) === i)
  const h = hover != null ? data[hover] : null
  if (!data.length) return null
  return (
    <figure className="an-trend">
      <figcaption>
        <span className="an-trend__title" id={id}>
          {title}
        </span>
        <span className="an-trend__total">{fmtNum(sum, lang)}</span>
      </figcaption>
      <div className="an-trend__plot">
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-labelledby={id}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX)}
          onPointerLeave={() => setHover(null)}
          onFocus={() => setHover((v) => v ?? data.length - 1)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') setHover((v) => Math.max(0, (v ?? data.length - 1) - 1))
            if (e.key === 'ArrowRight') setHover((v) => Math.min(data.length - 1, (v ?? 0) + 1))
          }}
        >
          {ticks.map((tk) => (
            <g key={tk}>
              <line x1={pad.l} x2={W - pad.r} y1={y(tk)} y2={y(tk)} className="an-grid" />
              <text x={pad.l - 6} y={y(tk) + 3.5} className="an-axis" textAnchor="end">
                {fmtNum(tk, lang)}
              </text>
            </g>
          ))}
          {labelIdx.map((i) => (
            <text key={i} x={x(i)} y={H - 5} className="an-axis" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}>
              {fmtDay(data[i].day, { lang })}
            </text>
          ))}
          <path d={area} className="an-area" />
          <path d={line} className="an-line" />
          {h && (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={y(0)} className="an-cross" />
              <circle cx={x(hover)} cy={y(vals[hover])} r="4" className="an-dot" />
            </g>
          )}
        </svg>
        {h && (
          <div className="an-tip" style={{ left: `${Math.min(88, Math.max(12, (x(hover) / W) * 100))}%` }} role="status">
            <strong>{fmtNum(vals[hover], lang)}</strong>
            <span>{fmtDay(h.day, { long: true, lang })}</span>
          </div>
        )}
      </div>
    </figure>
  )
}

// Ranked list: a thin bar per row, the value printed beside it.
export function Bars({ title, rows, label, value = (r) => r.n, show = null, note, empty = 'Nothing in this period.', lang = 'en' }) {
  const max = Math.max(1, ...rows.map(value))
  return (
    <section className="an-card">
      <h3>{title}</h3>
      {note && <p className="an-note">{note}</p>}
      {!rows.length ? (
        <p className="an-note">{empty}</p>
      ) : (
        <ol className="an-bars">
          {rows.map((r, i) => (
            <li key={i} title={`${label(r)}: ${show ? show(r) : fmtNum(value(r), lang)}`}>
              <span className="an-bars__k">{label(r)}</span>
              <span className="an-bars__track" aria-hidden="true">
                <span style={{ width: `${Math.max(2, (value(r) / max) * 100)}%` }} />
              </span>
              <span className="an-bars__v">{show ? show(r) : fmtNum(value(r), lang)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// One row of period presets above everything they scope.
export function Periods({ days, onChange, options, busy, onRefresh, refreshLabel = 'Refresh', range = null }) {
  return (
    <div className="an-filters" role="group">
      {options.map(([n, label]) => (
        <button key={n} type="button" className="an-chip" aria-pressed={days === n} onClick={() => onChange(n)}>
          {label}
        </button>
      ))}
      {onRefresh && (
        <button type="button" className="btn btn--quiet btn--small" onClick={onRefresh} disabled={busy}>
          {refreshLabel}
        </button>
      )}
      {range && <span className="an-range">{range}</span>}
    </div>
  )
}

// Remembered per viewer (localStorage may be unavailable).
export function storedDays(key, fallback = 30) {
  try {
    return Number(localStorage.getItem(key)) || fallback
  } catch {
    return fallback
  }
}
export function storeDays(key, n) {
  try {
    localStorage.setItem(key, String(n))
  } catch {
    /* ignore */
  }
}

import { useId } from 'react'
import { useI18n } from '../i18n.js'
import { designLabel } from '../lib/designs.js'

// "Compare [As photographed] with [Design 2 — Coastal modern · Golden hour]  ⇄"
export default function SidePicker({ designs, left, right, onChange }) {
  const { t } = useI18n()
  const id = useId()
  const usable = designs.filter((d) => Object.keys(d.picks || {}).length || d.id === left || d.id === right)
  const options = [{ value: 'original', label: t('studio.current') }, ...usable.map((d) => ({ value: d.id, label: designLabel(d, designs.indexOf(d), t) }))]
  if (options.length < 2) return null
  return (
    <div className="sides" role="group" aria-label={t('compare.title')}>
      <label className="sides__field" htmlFor={`${id}-l`}>
        <span>{t('compare.left')}</span>
        <select id={`${id}-l`} value={left} onChange={(e) => onChange({ left: e.target.value, right })}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === right}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="sides__swap" onClick={() => onChange({ left: right, right: left })} aria-label={t('compare.swap')} title={t('compare.swap')} disabled={!right}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M7 7h11l-3-3M17 17H6l3 3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <label className="sides__field" htmlFor={`${id}-r`}>
        <span>{t('compare.right')}</span>
        <select id={`${id}-r`} value={right || ''} onChange={(e) => onChange({ left, right: e.target.value })}>
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === left}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}

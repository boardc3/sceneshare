import { useState } from 'react'
import { useI18n } from '../i18n.js'
import { Modal } from './Chrome.jsx'

const MODES = ['cleanup', 'redesign', 'polish'] // professional photo first: the reason most people upload

// Pop-up offered after an upload (and from any photo): clean up, restyle or relight
// just these photos, without touching the rest of the house.
export default function PhotoRestyle({ photos, styles, lights, onStart, onClose, busy = false }) {
  const { t } = useI18n()
  const [mode, setMode] = useState('cleanup')
  const [style, setStyle] = useState('signature')
  const [light, setLight] = useState('daylight')
  const [note, setNote] = useState('')
  const n = photos.length
  if (!n) return null
  return (
    <Modal labelledBy="pr-h" onClose={onClose} wide>
      <p className="page__eyebrow">{t(n === 1 ? 'pr.eyebrow1' : 'pr.eyebrow', { n })}</p>
      <h2 id="pr-h">{t(n === 1 ? 'pr.title1' : 'pr.title', { n })}</h2>
      <div className="pr__thumbs">
        {photos.slice(0, 6).map((p) => (
          <img key={p.id} src={p.src} alt="" width={p.width} height={p.height} />
        ))}
        {n > 6 && <span className="pr__more">+{n - 6}</span>}
      </div>
      <div className="seg seg--wide" role="group" aria-label={t('studio.mode.label')}>
        {MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {t(`pr.mode.${m}`)}
          </button>
        ))}
      </div>
      <p className="fine">{t(`pr.about.${mode}`)}</p>
      {mode === 'redesign' && (
        <label className="field">
          <span>{t('studio.style')}</span>
          <select value={style} onChange={(e) => setStyle(e.target.value)}>
            {styles.map((s) => (
              <option key={s} value={s}>
                {t(`style.${s}`)}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="field">
        <span>{t('studio.light')}</span>
        <select value={light} onChange={(e) => setLight(e.target.value)}>
          {lights.map((l) => (
            <option key={l} value={l}>
              {t(`light.${l}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>{t('pr.note')}</span>
        <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t(mode === 'redesign' ? 'design.notePh' : 'pr.notePh')} maxLength={300} />
      </label>
      <div className="dialog__actions">
        <button type="button" className="btn btn--glow" disabled={busy} onClick={() => onStart({ mode, style: mode === 'redesign' ? style : null, light, note: note.trim() })}>
          {busy ? t('design.starting') : t(`pr.go.${mode}`, { n })}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {t('pr.later')}
        </button>
      </div>
      <p className="fine">{t('pr.keep')}</p>
    </Modal>
  )
}

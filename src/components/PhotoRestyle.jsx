import { useI18n } from '../i18n.js'
import { Modal } from './Chrome.jsx'

// Pop-up offered after an upload (and from any photo): one click turns just these
// photos into professional listing photos. Restyle and relight stay in the studio
// panel for people who want them (Chris, 2026-11-09: keep the first step simple).
export default function PhotoRestyle({ photos, onStart, onClose, busy = false }) {
  const { t } = useI18n()
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
      <p className="fine">{t('pr.about.cleanup')}</p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--glow" disabled={busy} onClick={() => onStart({ mode: 'cleanup', style: null, light: 'daylight', note: '' })}>
          {busy ? t('design.starting') : t('pr.go.cleanup', { n })}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {t('pr.later')}
        </button>
      </div>
      <p className="fine">{t('pr.keep')}</p>
    </Modal>
  )
}

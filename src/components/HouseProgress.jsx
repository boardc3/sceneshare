import { useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { Modal } from './Chrome.jsx'

// The loading block for "Restyle this house": the page waits behind it, every
// photo shows its state, and the result is clear at the end.
export default function HouseProgress({ run, photos, onStop, onRetry, onClose }) {
  const { t } = useI18n()
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (run.status !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [run.status])

  const total = run.items.length
  const done = run.items.filter((i) => i.state === 'done').length
  const failed = run.items.filter((i) => i.state === 'failed' || i.state === 'skipped').length
  const pct = total ? Math.round((done / total) * 100) : 0
  const running = run.status === 'running'
  const elapsed = Math.max(1, (now - run.started) / 1000)
  // Rough time left from the pace so far (three photos at a time).
  const finished = run.items.filter((i) => i.ms)
  const avg = finished.length ? finished.reduce((a, i) => a + i.ms, 0) / finished.length / 1000 : 30
  const left = Math.max(0, total - done - failed)
  const eta = Math.max(10, Math.round((Math.ceil(left / 3) * avg) / 10) * 10)
  const byId = Object.fromEntries(photos.map((p) => [p.id, p]))

  const title = running ? t('run.title', { name: run.label }) : run.status === 'done' ? t('run.doneTitle') : run.status === 'fatal' ? t('run.fatalTitle') : t('run.partialTitle')

  return (
    <Modal labelledBy="run-h" onClose={running ? () => {} : onClose} wide locked={running}>
      <div className="run" aria-busy={running}>
        <h2 id="run-h">{title}</h2>
        <p className="run__name">{run.label}</p>
        <div className="run__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={t('run.progress', { done, total })}>
          <span style={{ width: `${Math.max(running ? 3 : 0, pct)}%` }} />
        </div>
        <p className="run__status" aria-live="polite">
          {running
            ? `${t('run.progress', { done, total })} · ${left ? t('run.eta', { min: Math.max(1, Math.round(eta / 60)) }) : t('run.finishing')} · ${t('run.elapsed', { s: Math.round(elapsed) })}`
            : run.status === 'done'
              ? t('run.done', { total })
              : run.status === 'fatal'
                ? run.fatal
                : t('run.partial', { done, missing: total - done })}
        </p>
        {running && <p className="fine run__keep">{t('run.keepOpen')}</p>}
        <ul className="run__grid">
          {run.items.map((it) => {
            const ph = byId[it.photoId]
            const src = it.version?.src || ph?.src
            return (
              <li key={it.photoId} className={`run__cell run__cell--${it.state}`}>
                {src && <img src={src} alt="" loading="lazy" />}
                <span className="run__badge">
                  {it.state === 'working' || it.state === 'retrying' ? <span className="spinner spinner--small" aria-hidden="true" /> : null}
                  {t(`run.state.${it.state}`)}
                  {it.state === 'retrying' || (it.state === 'working' && it.attempt > 1) ? ` · ${t('run.try', { n: it.attempt })}` : ''}
                </span>
              </li>
            )
          })}
        </ul>
        <div className="dialog__actions">
          {running ? (
            <button type="button" className="btn btn--quiet" onClick={onStop}>
              {t('run.stop')}
            </button>
          ) : (
            <>
              {total - done > 0 && run.status !== 'fatal' && (
                <button type="button" className="btn btn--quiet" onClick={onRetry}>
                  {t('run.retry', { n: total - done })}
                </button>
              )}
              <button type="button" className="btn btn--glow" onClick={onClose}>
                {run.status === 'done' ? t('run.see') : t('run.close')}
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

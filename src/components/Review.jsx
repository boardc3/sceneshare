import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { useBilling } from '../lib/billing.js'
import { Link } from '../router.jsx'
import Compare from './Compare.jsx'
import { Modal } from './Chrome.jsx'

// The review pass after a design is rendered: step through every image, mark it
// "looks good" or write a note, then apply only the notes. Twenty images and two
// changes means two credits, not twenty. Notes save as you type (to the home, so
// a review started on a phone can be finished on a laptop) and stay private.
export default function Review({ property, design, photos, name, startAt, onSave, onApply, onDiscard, onClose }) {
  const { t, lang } = useI18n()
  const { billing: b } = useBilling()
  const items = useMemo(() => photos.filter((p) => design.picks[p.id]), [photos, design.picks])
  const [i, setI] = useState(() => Math.max(0, items.findIndex((p) => p.id === startAt)))
  const [drafts, setDrafts] = useState({}) // photoId -> note text being typed
  const [saved, setSaved] = useState({}) // photoId -> 'saving' | 'saved'
  const [applying, setApplying] = useState(null) // { ids, done, failed: [] }
  const [error, setError] = useState('')
  const timers = useRef({})
  const noteRef = useRef(null)
  const review = design.review || {}

  const ph = items[Math.min(i, items.length - 1)]
  const entry = ph ? review[ph.id] : null
  const status = entry?.status || null
  const draft = ph ? drafts[ph.id] ?? (entry?.status === 'change' ? entry.note : '') : ''
  const version = ph ? ph.versions.find((v) => v.id === design.picks[ph.id]) : null
  const history = ph ? ph.versions.filter((v) => v.designId === design.id) : []

  const noteOf = (id) => (drafts[id] ?? (review[id]?.status === 'change' ? review[id].note : '')).trim()
  const pending = items.filter((p) => review[p.id]?.status === 'change' && noteOf(p.id))
  const counts = {
    ok: items.filter((p) => review[p.id]?.status === 'ok').length,
    change: pending.length,
    applied: items.filter((p) => review[p.id]?.status === 'applied').length,
  }
  const todo = items.length - counts.ok - items.filter((p) => review[p.id]?.status === 'change').length - counts.applied

  // ------------------------------------------------------------ saving
  const save = useCallback(
    async (photoId, patch) => {
      setSaved((s) => ({ ...s, [photoId]: 'saving' }))
      const ok = await onSave(photoId, patch)
      setSaved((s) => ({ ...s, [photoId]: ok ? 'saved' : null }))
      if (!ok) setError(t('review.saveFailed'))
    },
    [onSave, t],
  )
  const flush = (photoId) => {
    if (!timers.current[photoId]) return
    clearTimeout(timers.current[photoId].id)
    const { note } = timers.current[photoId]
    delete timers.current[photoId]
    save(photoId, { status: 'change', note })
  }
  useEffect(() => () => Object.keys(timers.current).forEach(flush), []) // eslint-disable-line react-hooks/exhaustive-deps

  const type = (text) => {
    if (!ph) return
    const id = ph.id
    setDrafts((d) => ({ ...d, [id]: text }))
    setSaved((s) => ({ ...s, [id]: null }))
    clearTimeout(timers.current[id]?.id)
    timers.current[id] = { note: text, id: setTimeout(() => flush(id), 700) }
  }

  // ------------------------------------------------------------ moving
  const go = useCallback(
    (n) => {
      if (ph) flush(ph.id)
      setError('')
      setI(Math.max(0, Math.min(items.length - 1, n)))
    },
    [items.length, ph], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const nextOpen = () => {
    // The next image not yet reviewed, else simply the next one.
    for (let k = 1; k <= items.length; k++) {
      const j = (i + k) % items.length
      if (!review[items[j].id] && items[j].id !== ph.id) return go(j)
    }
    if (i < items.length - 1) go(i + 1)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('textarea, input')) return
      if (e.key === 'ArrowRight') go(i + 1)
      if (e.key === 'ArrowLeft') go(i - 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [i, go])

  const good = () => {
    clearTimeout(timers.current[ph.id]?.id)
    delete timers.current[ph.id]
    setDrafts((d) => {
      const n = { ...d }
      delete n[ph.id]
      return n
    })
    save(ph.id, { status: 'ok' })
    track('review_ok', null, { propertyId: property.id })
    nextOpen()
  }
  const change = () => {
    if (status !== 'change') save(ph.id, { status: 'change', note: draft })
    setTimeout(() => noteRef.current?.focus(), 30)
  }
  const undo = () => {
    clearTimeout(timers.current[ph.id]?.id)
    delete timers.current[ph.id]
    setDrafts((d) => {
      const n = { ...d }
      delete n[ph.id]
      return n
    })
    save(ph.id, { status: null })
  }

  // ------------------------------------------------------------ applying
  const apply = async () => {
    const list = pending.map((p) => ({ photo: p, note: noteOf(p.id) }))
    if (!list.length) return
    Object.keys(timers.current).forEach(flush)
    setError('')
    track('review_apply', { n: list.length, of: items.length }, { propertyId: property.id })
    const state = { ids: list.map((x) => x.photo.id), done: 0, failed: [] }
    setApplying({ ...state })
    // Two at a time: quick enough, and gentle on the credit counter.
    let next = 0
    const worker = async () => {
      while (next < list.length) {
        const { photo, note } = list[next++]
        const ok = await onApply(photo, note)
        if (ok === 'stop') {
          next = list.length
          state.failed.push(photo.id)
        } else if (ok) state.done++
        else state.failed.push(photo.id)
        setApplying({ ...state })
      }
    }
    await Promise.all([worker(), worker()])
    setDrafts({})
    setApplying({ ...state, finished: true })
    const first = items.findIndex((p) => state.ids.includes(p.id) && !state.failed.includes(p.id))
    if (first >= 0) setI(first)
    if (state.failed.length) setError(t('review.someFailed', { n: state.failed.length }))
  }
  const running = applying && !applying.finished

  const c = b?.credits
  const short = c && !c.unlimited && b.mode !== 'off' && c.available < counts.change
  const fmt = (n) => new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(n)

  if (!ph) return null
  const beforeImg = ph
  const busyHere = running && applying.ids.includes(ph.id)

  return (
    <Modal labelledBy="review-h" onClose={() => !running && onClose()} size="full" locked={running}>
      <div className="review">
        <header className="review__head">
          <div>
            <p className="review__eyebrow">{t('review.eyebrow')}</p>
            <h2 id="review-h">{name}</h2>
          </div>
          <p className="review__tally" aria-live="polite">
            <span className="rv rv--ok">{t('review.nOk', { n: counts.ok })}</span>
            <span className="rv rv--change">{t('review.nChange', { n: counts.change })}</span>
            {counts.applied > 0 && <span className="rv rv--applied">{t('review.nApplied', { n: counts.applied })}</span>}
            <span className="rv">{t('review.nTodo', { n: Math.max(0, todo) })}</span>
          </p>
          <button type="button" className="review__x" onClick={onClose} disabled={running} aria-label={t('gate.close')}>
            ×
          </button>
        </header>

        <div className="review__body">
          <div className="review__stage">
            <button type="button" className="review__nav review__nav--prev" onClick={() => go(i - 1)} disabled={i === 0} aria-label={t('review.prev')}>
              ‹
            </button>
            <div className="review__frame" style={{ "--ar": ph.width && ph.height ? ph.width / ph.height : 1.5 }}>
              <Compare key={`${ph.id}-${version?.id}`} before={beforeImg.src} after={version?.src} width={ph.width} height={ph.height} beforeLabel={t('review.before')} afterLabel={t('review.after')} alt="" start={50} />
              {busyHere && (
                <div className="viewer__busy" role="status">
                  <span className="spinner" aria-hidden="true" /> {t('studio.applying')}
                </div>
              )}
            </div>
            <button type="button" className="review__nav review__nav--next" onClick={() => go(i + 1)} disabled={i === items.length - 1} aria-label={t('review.next')}>
              ›
            </button>
          </div>

          <aside className="review__panel">
            <p className="review__count">{t('review.count', { n: i + 1, total: items.length })}</p>

            {status === 'applied' && (
              <div className="review__applied">
                <p>
                  <strong>{t('review.appliedTitle')}</strong> {history.length > 1 && t('review.versionN', { n: history.findIndex((v) => v.id === version?.id) + 1 })}
                </p>
                <p className="review__quote">“{entry.note}”</p>
              </div>
            )}

            <div className="review__choice" role="group" aria-label={t('review.choiceLabel')}>
              <button type="button" className="btn btn--small review__good" aria-pressed={status === 'ok'} onClick={good} disabled={running}>
                ✓ {t('review.good')}
              </button>
              <button type="button" className="btn btn--small review__change" aria-pressed={status === 'change'} onClick={change} disabled={running}>
                ✎ {status === 'applied' ? t('review.another') : t('review.change')}
              </button>
            </div>

            {status === 'change' && (
              <label className="review__note">
                <span>{t('review.noteLabel')}</span>
                <textarea ref={noteRef} rows={4} value={draft} onChange={(e) => type(e.target.value)} onBlur={() => flush(ph.id)} placeholder={t('studio.feedbackPh')} maxLength={600} disabled={running} />
                <span className="review__saved" aria-live="polite">
                  {saved[ph.id] === 'saving' ? t('review.saving') : saved[ph.id] === 'saved' && draft.trim() ? t('review.saved') : ''}
                </span>
              </label>
            )}
            {status && status !== 'applied' && (
              <button type="button" className="linkbtn review__undo" onClick={undo} disabled={running}>
                {t('review.clear')}
              </button>
            )}
            <p className="fine">{t('studio.feedbackNote')}</p>
            {history.length > 1 && <p className="fine">{t('review.history', { n: history.length })}</p>}
          </aside>
        </div>

        <ol className="review__strip" aria-label={t('review.all')}>
          {items.map((p, k) => {
            const r = review[p.id]?.status
            const v = p.versions.find((x) => x.id === design.picks[p.id])
            const working = running && applying.ids.includes(p.id) && !applying.failed.includes(p.id)
            return (
              <li key={p.id}>
                <button type="button" aria-current={k === i ? 'true' : undefined} onClick={() => go(k)} aria-label={`${t('review.count', { n: k + 1, total: items.length })}${r ? ` · ${t(`review.s.${r}`)}` : ''}`}>
                  <img src={v?.src || p.src} alt="" loading="lazy" />
                  {r && <span className={`review__dot review__dot--${r}`} aria-hidden="true" />}
                  {working && <span className="thumbs__busy spinner spinner--small" aria-hidden="true" />}
                </button>
              </li>
            )
          })}
        </ol>

        <footer className="review__foot">
          {error && (
            <p className="banner banner--error" role="alert">
              {error}
            </p>
          )}
          <p className={`review__cost${!running && !counts.change ? ' review__cost--hint' : ''}`}>
            {running
              ? t('review.applying', { done: applying.done + applying.failed.length, total: applying.ids.length })
              : counts.change
                ? c && !c.unlimited && b.mode !== 'off'
                  ? short
                    ? t('credits.runShort', { n: counts.change, left: c.available })
                    : t(counts.change === 1 ? 'review.cost1' : 'review.cost', { n: counts.change, left: fmt(c.available - counts.change) })
                  : t(counts.change === 1 ? 'review.ready1' : 'review.ready', { n: counts.change })
                : todo > 0
                  ? t('review.hint')
                  : t('review.allDone')}{' '}
            {short && !running && <Link to="/plan#credits">{t('credits.buyMore')}</Link>}
          </p>
          <div className="review__actions">
            <button type="button" className="btn btn--quiet btn--danger review__discard" onClick={onDiscard} disabled={running}>
              {t('design.discard')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={onClose} disabled={running}>
              {counts.change ? t('review.later') : t('review.done')}
            </button>
            <button type="button" className="btn btn--glow" onClick={apply} disabled={!counts.change || running || short}>
              {running ? <span className="spinner spinner--small" aria-hidden="true" /> : null} {t(counts.change === 1 ? 'review.apply1' : 'review.apply', { n: counts.change })}
            </button>
          </div>
        </footer>
      </div>
    </Modal>
  )
}

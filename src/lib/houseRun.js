import { useCallback, useEffect, useRef, useState } from 'react'
import { track } from './analytics.js'
import { post, retriable, sleep } from './api.js'

// "Restyle this house": every visible photo through one design, three at a time.
// Each photo gets up to four tries here (and the server tries two model ids twice
// each per try), with backoff, so a busy model or a dropped connection costs time,
// not the photo. Photos still missing at the end are listed, saved as "missing" on
// the design, and can be retried with one tap — then or any time later.

const CONCURRENCY = 3
const BACKOFF = [4000, 10000, 20000]
// Errors no retry can fix: stop the whole run and say why.
const FATAL = new Set(['render_billing', 'render_not_configured', 'sign_in_required', 'not_owner', 'design_missing', 'accounts_not_configured', 'storage_not_configured'])

export function useHouseRun({ propertyId, lang, onRendered, onFinished }) {
  const [run, setRun] = useState(null)
  const stopRef = useRef(false)

  const patchItem = (photoId, patch) =>
    setRun((r) => (r ? { ...r, items: r.items.map((it) => (it.photoId === photoId ? { ...it, ...patch } : it)) } : r))

  // Leaving mid-run loses nothing already rendered, but say so.
  useEffect(() => {
    if (run?.status !== 'running') return
    const warn = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    let lock = null
    navigator.wakeLock?.request?.('screen').then((l) => (lock = l)).catch(() => {})
    return () => {
      window.removeEventListener('beforeunload', warn)
      lock?.release?.().catch(() => {})
    }
  }, [run?.status])

  const renderOne = useCallback(
    async (designId, photoId) => {
      for (let attempt = 1; attempt <= 4; attempt++) {
        if (stopRef.current) return { state: 'stopped' }
        patchItem(photoId, { state: 'working', attempt })
        const t0 = Date.now()
        try {
          const d = await post('/api/render', { propertyId, designId, photoId, lang })
          onRendered(photoId, d.version, d.design)
          patchItem(photoId, { state: 'done', version: d.version, ms: Date.now() - t0 })
          return { state: 'done', ms: Date.now() - t0 }
        } catch (e) {
          if (FATAL.has(e.code) || e.status === 401 || e.status === 403) return { state: 'fatal', error: e }
          if (e.code === 'render_blocked' || e.code === 'photo_missing' || !retriable(e) || attempt === 4) {
            track('render_photo_failed', { designId, code: e.code, attempt }, { propertyId })
            patchItem(photoId, { state: 'failed', error: e.message || e.code })
            return { state: 'failed', error: e }
          }
          track('render_retry', { designId, code: e.code, attempt }, { propertyId })
          patchItem(photoId, { state: 'retrying', error: e.message || e.code })
          await sleep(BACKOFF[attempt - 1])
        }
      }
      return { state: 'failed' }
    },
    [propertyId, lang, onRendered],
  )

  const go = useCallback(
    async (design, photoIds, { label, retry = false } = {}) => {
      stopRef.current = false
      const items = photoIds.map((photoId) => ({ photoId, state: 'queued', attempt: 0 }))
      const started = Date.now()
      setRun((prev) => ({
        designId: design.id,
        label,
        status: 'running',
        started,
        fatal: null,
        // A retry keeps the photos that already finished on screen.
        items: retry && prev?.designId === design.id ? prev.items.map((it) => items.find((x) => x.photoId === it.photoId) || it) : items,
      }))
      track(retry ? 'house_restyle_retry' : 'house_restyle_start', { designId: design.id, mode: design.mode, style: design.style, light: design.light, photos: photoIds.length }, { propertyId })

      const queue = [...photoIds]
      const states = new Map()
      let fatal = null
      const durations = []
      const worker = async () => {
        while (queue.length && !fatal && !stopRef.current) {
          const photoId = queue.shift()
          const r = await renderOne(design.id, photoId)
          states.set(photoId, r.state)
          if (r.ms) durations.push(r.ms)
          if (r.state === 'fatal') {
            fatal = r.error
            stopRef.current = true
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, photoIds.length) }, worker))

      const failed = photoIds.filter((id) => states.get(id) !== 'done')
      let saved = null
      try {
        saved = await post('/api/properties', { op: 'design.finish', propertyId, designId: design.id, failed, lang })
      } catch {
        /* the design keeps its picks either way; "missing" is recomputed next time */
      }
      const status = fatal ? 'fatal' : stopRef.current ? 'stopped' : failed.length ? 'partial' : 'done'
      setRun((r) => (r ? { ...r, status, fatal: fatal ? fatal.message || fatal.code : null, items: r.items.map((it) => (it.state === 'queued' || it.state === 'working' || it.state === 'retrying' ? { ...it, state: 'skipped' } : it)) } : r))
      track('house_restyle_end', { designId: design.id, status, failed: failed.length, total: photoIds.length, seconds: Math.round((Date.now() - started) / 1000), avgMs: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null, fatal: fatal?.code || null }, { propertyId })
      onFinished?.(saved?.property || null, status)
    },
    [propertyId, lang, renderOne, onFinished],
  )

  const stop = () => {
    stopRef.current = true
    track('house_restyle_stop', null, { propertyId })
  }
  const close = () => setRun(null)
  return { run, go, stop, close }
}

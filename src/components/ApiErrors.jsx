import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'

// Small notices for request failures the page doesn't explain itself (lib/api.js
// announces them): what failed, why, and the details to copy while testing.
// The same failure within 15 s is counted, not repeated.
const ROUTES = ['shares', 'listing', 'render', 'properties', 'property', 'upload', 'billing', 'account', 'autocomplete', 'events', 'lead', 'terms', 'privacy', 'admin', 'health']

export default function ApiErrors() {
  const { t, lang } = useI18n()
  const [list, setList] = useState([])
  const timers = useRef({})

  useEffect(() => {
    const on = (ev) => {
      const d = ev.detail || {}
      if (d.path === '/api/events') return // analytics never bothers the visitor
      const key = `${d.method} ${d.path} ${d.code}`
      setList((cur) => {
        const same = cur.find((x) => x.key === key && Date.now() - x.t < 15000)
        if (same) return cur.map((x) => (x === same ? { ...x, n: x.n + 1, t: Date.now(), d } : x))
        return [...cur, { key, id: Math.random().toString(36).slice(2), n: 1, t: Date.now(), d }].slice(-3)
      })
      track('api_error_shown', { code: d.code, status: d.status, path: d.path })
    }
    window.addEventListener('ss:api-error', on)
    return () => window.removeEventListener('ss:api-error', on)
  }, [])

  // Each notice stays 12 s (paused while hovered or focused).
  useEffect(() => {
    for (const x of list) {
      if (timers.current[x.id] || x.hold) continue
      timers.current[x.id] = setTimeout(() => close(x.id), 12000)
    }
  }, [list]) // eslint-disable-line react-hooks/exhaustive-deps
  const close = (id) => {
    clearTimeout(timers.current[id])
    delete timers.current[id]
    setList((cur) => cur.filter((x) => x.id !== id))
  }
  const hold = (id, on) => {
    if (on) {
      clearTimeout(timers.current[id])
      delete timers.current[id]
    }
    setList((cur) => cur.map((x) => (x.id === id ? { ...x, hold: on } : x)))
  }

  if (!list.length) return null
  return (
    <div className="apierrs" role="region" aria-label={t('apierr.region')}>
      {list.map(({ id, n, d }) => {
        const route = (d.path || '').replace(/^\/api\//, '').split('/')[0]
        const what = ROUTES.includes(route) ? t(`apierr.r.${route}`) : t('apierr.r.other')
        const why =
          d.code === 'network' ? t('apierr.network') : d.status === 429 ? t('apierr.rate') : d.status >= 500 ? t('apierr.server') : d.message || t('err.generic')
        const time = new Date(d.at).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
        const details = [`${d.method} ${d.path}`, `status ${d.status || '—'} · ${d.code}`, d.message && `message: ${d.message}`, d.requestId && `request: ${d.requestId}`, `at: ${d.at}`, `page: ${location.pathname}`].filter(Boolean).join('\n')
        return (
          <div key={id} className={`apierr ${d.status === 429 ? 'apierr--rate' : ''}`} role="alert" onPointerEnter={() => hold(id, true)} onPointerLeave={() => hold(id, false)} onFocus={() => hold(id, true)}>
            <div className="apierr__body">
              <p className="apierr__title">
                {t('apierr.title', { what })}
                {n > 1 && <span className="apierr__n"> ×{n}</span>}
              </p>
              <p className="apierr__why">{why}</p>
              <p className="apierr__meta">
                {d.status || '—'} · {d.code} · {d.method} {d.path} · {time}
              </p>
            </div>
            <div className="apierr__actions">
              <button
                type="button"
                className="linkbtn"
                onClick={(e) => {
                  navigator.clipboard?.writeText(details).then(
                    () => (e.target.textContent = t('apierr.copied')),
                    () => {},
                  )
                }}
              >
                {t('apierr.copy')}
              </button>
              <button type="button" className="apierr__x" onClick={() => close(id)} aria-label={t('gate.close')}>
                ×
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

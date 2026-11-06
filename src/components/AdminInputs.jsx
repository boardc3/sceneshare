import { useCallback, useEffect, useState } from 'react'
import { get, shown } from '../lib/api.js'
import { Bars, fmtNum as fmt, Periods, storeDays, storedDays } from './Charts.jsx'

// /admin → AI inputs: every instruction given to the image model — each round's
// type, style, light and typed notes, and every change request on one image.
const PERIODS = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last year'],
]
const MODE = { redesign: 'Restyle', cleanup: 'Make it professional', polish: 'Relight', exterior: 'Exterior' }
const label = (s) => (s ? s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase()) : '—')
const when = (s) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

export default function AdminInputs() {
  const [days, setDays] = useState(() => storedDays('ss:admin:idays'))
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(() => {
    const id = setTimeout(() => setTerm(q.trim()), 300)
    return () => clearTimeout(id)
  }, [q])
  const load = useCallback(() => {
    setBusy(true)
    setErr('')
    const p = new URLSearchParams({ inputs: '1', days: String(days), ...(kind ? { kind } : {}), ...(term ? { q: term } : {}) })
    return get(`/api/admin?${p}`)
      .then(setD)
      .catch((e) => setErr(shown(e) || 'Could not load AI inputs.'))
      .finally(() => setBusy(false))
  }, [days, kind, term])
  useEffect(() => {
    load()
    storeDays('ss:admin:idays', days)
  }, [load, days])

  const copyAll = () =>
    navigator.clipboard?.writeText(
      (d?.rows || []).map((r) => [when(r.at), r.email || '', r.home, r.kind === 'change' ? 'Change request' : MODE[r.mode] || r.mode, label(r.style), r.light || '', `"${String(r.text || '').replace(/"/g, '""')}"`].join('\t')).join('\n'),
    )
  const T = d?.totals || {}
  return (
    <div className={`an ${busy && d ? 'is-busy' : ''}`}>
      <Periods days={days} onChange={setDays} options={PERIODS} busy={busy} onRefresh={load} refreshLabel={busy ? 'Loading…' : 'Refresh'} />
      {err && <p className="banner banner--error">{err}</p>}
      {d && (
        <>
          <ul className="an-kpis">
            {[
              ['Rounds started', T.rounds],
              ['…with typed instructions', T.with_text],
              ['Change requests', T.changes],
            ].map(([k, v]) => (
              <li key={k}>
                <span className="an-kpi__k">{k}</span>
                <span className="an-kpi__v">{fmt(v)}</span>
              </li>
            ))}
          </ul>
          <div className="an-grid3">
            <Bars title="Styles chosen" rows={d.styles} label={(r) => MODE[r.style] || label(r.style)} />
            <Bars title="Lighting chosen" rows={d.lights} label={(r) => label(r.light)} />
          </div>
          <section className="an-card an-card--wide">
            <div className="an-sechead">
              <h3>Inputs ({d.rows.length})</h3>
              <div className="an-filters an-filters--tight">
                {[
                  ['', 'All'],
                  ['round', 'Rounds'],
                  ['change', 'Change requests'],
                ].map(([k, l]) => (
                  <button key={k} type="button" className="an-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                    {l}
                  </button>
                ))}
                <input className="an-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search words, email, home" aria-label="Search AI inputs" />
                <button type="button" className="btn btn--quiet btn--small" onClick={copyAll} disabled={!d.rows.length}>
                  Copy as table
                </button>
              </div>
            </div>
            {!d.rows.length ? (
              <p className="an-note">No inputs in this period.</p>
            ) : (
              <ol className="ai-inputs">
                {d.rows.map((r) => (
                  <li key={`${r.kind}-${r.id}`} className={`ai-input ai-input--${r.kind}`}>
                    <div className="ai-input__meta">
                      <span className="ai-input__kind">{r.kind === 'change' ? 'Change request' : MODE[r.mode] || r.mode}</span>
                      {r.kind === 'round' && r.style && <span>{label(r.style)}</span>}
                      {r.kind === 'round' && r.light && <span>{label(r.light)} light</span>}
                      {r.kind === 'round' && (
                        <span>
                          {fmt(r.images)} image{r.images === 1 ? '' : 's'}
                          {r.changes ? ` · ${fmt(r.changes)} change${r.changes === 1 ? '' : 's'}` : ''}
                        </span>
                      )}
                    </div>
                    <p className={`ai-input__text ${r.text ? '' : 'is-empty'}`}>{r.text || 'No typed instructions — style and light only.'}</p>
                    <div className="ai-input__foot">
                      <span>{when(r.at)}</span>
                      <span>{r.email || 'unknown'}</span>
                      <a href={`/p/${r.property_id}`} target="_blank" rel="noreferrer">
                        {r.home}
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  )
}

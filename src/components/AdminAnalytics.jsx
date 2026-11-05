import { useCallback, useEffect, useState } from 'react'
import { get, shown } from '../lib/api.js'
import { Bars, Delta, fmtDay, fmtDuration as secs, fmtNum as fmt, Periods, storeDays, storedDays, Trend } from './Charts.jsx'

// /admin → Analytics: the whole site. One row of filters scopes everything below.
const PERIODS = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [180, 'Last 180 days'],
]
const KPIS = [
  ['visitors', 'Visitors'],
  ['page_views', 'Page views'],
  ['signups', 'New accounts'],
  ['homes', 'Homes added'],
  ['renders', 'Images rendered'],
  ['shares', 'Shares sent'],
  ['buyer_views', 'Buyer views', 'Opens of share pages'],
  ['leads', 'Emails captured'],
  ['avg_engaged_ms', 'Avg engaged time', 'Per session', secs],
]
const TRENDS = [
  ['page_views', 'Page views'],
  ['visitors', 'Visitors'],
  ['signups', 'New accounts'],
  ['homes', 'Homes added'],
  ['renders', 'Images rendered'],
  ['shares', 'Shares sent'],
  ['buyer_views', 'Buyer views'],
  ['leads', 'Emails captured'],
]

function Funnel({ f }) {
  const steps = [
    ['visited', 'Visited'],
    ['searched', 'Searched an address'],
    ['studio', 'Opened the studio'],
    ['restyled', 'Started a restyle'],
    ['shared', 'Shared a home'],
  ]
  const top = Math.max(1, f.visited || 0)
  return (
    <section className="an-card an-card--wide">
      <h3>Owner funnel</h3>
      <p className="an-note">Sessions that reached each step.</p>
      <ol className="an-funnel">
        {steps.map(([k, label], i) => {
          const v = f[k] || 0
          const prev = i ? f[steps[i - 1][0]] || 0 : null
          return (
            <li key={k}>
              <span className="an-funnel__k">{label}</span>
              <span className="an-funnel__track" aria-hidden="true">
                <span style={{ width: `${Math.max(1.5, (v / top) * 100)}%` }} />
              </span>
              <span className="an-funnel__v">
                <strong>{fmt(v)}</strong> <span>{Math.round((v / top) * 100)}%</span>
                {prev != null && <span className="an-funnel__step">{prev ? `${Math.round((v / prev) * 100)}% of previous step` : '—'}</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

export default function AdminAnalytics() {
  const [days, setDays] = useState(() => storedDays('ss:admin:days'))
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [table, setTable] = useState(false)
  const load = useCallback(() => {
    setBusy(true)
    setErr('')
    return get(`/api/admin?analytics=1&days=${days}`)
      .then((r) => setD(r.analytics))
      .catch((e) => setErr(shown(e) || 'Could not load analytics.'))
      .finally(() => setBusy(false))
  }, [days])
  useEffect(() => {
    load()
    storeDays('ss:admin:days', days)
  }, [load, days])

  const T = d?.totals || {}
  const P = d?.previous || {}
  return (
    <div className={`an ${busy && d ? 'is-busy' : ''}`}>
      <Periods
        days={days}
        onChange={setDays}
        options={PERIODS}
        busy={busy}
        onRefresh={load}
        refreshLabel={busy ? 'Loading…' : 'Refresh'}
        range={d ? `${fmtDay(d.daily[0]?.day)} – ${fmtDay(d.daily[d.daily.length - 1]?.day)} · Pacific time` : null}
      />
      {err && <p className="banner banner--error">{err}</p>}
      {!d ? (
        !err && <p className="fine">Loading analytics…</p>
      ) : (
        <>
          <ul className="an-kpis">
            {KPIS.map(([k, label, sub, f = fmt]) => (
              <li key={k}>
                <span className="an-kpi__k">{label}</span>
                <span className="an-kpi__v">{f(T[k])}</span>
                <Delta now={T[k]} before={P[k]} />
                {sub && <span className="an-kpi__sub">{sub}</span>}
              </li>
            ))}
          </ul>

          <section>
            <div className="an-sechead">
              <h3>Daily</h3>
              <button type="button" className="linkbtn" onClick={() => setTable((v) => !v)} aria-expanded={table}>
                {table ? 'Hide table' : 'Show as table'}
              </button>
            </div>
            <div className="an-trends">
              {TRENDS.map(([k, t]) => (
                <Trend key={k} title={t} data={d.daily} field={k} />
              ))}
            </div>
            {table && (
              <div className="tablewrap">
                <table className="admin__table an-table">
                  <thead>
                    <tr>
                      <th scope="col">Day</th>
                      {TRENDS.map(([k, t]) => (
                        <th key={k} scope="col">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...d.daily].reverse().map((r) => (
                      <tr key={r.day}>
                        <td>{fmtDay(r.day, { long: true })}</td>
                        {TRENDS.map(([k]) => (
                          <td key={k}>{fmt(r[k])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="an-grid2">
            <Funnel f={d.funnel} />
            <section className="an-card">
              <h3>Rendering</h3>
              <dl className="an-dl">
                <div>
                  <dt>Images rendered</dt>
                  <dd>{fmt(d.renders.n)}</dd>
                </div>
                <div>
                  <dt>Of which change requests</dt>
                  <dd>{fmt(d.renders.changes)}</dd>
                </div>
                <div>
                  <dt>Average time per image</dt>
                  <dd>{secs(d.renders.avg_ms)}</dd>
                </div>
                <div>
                  <dt>Slowest 10% take over</dt>
                  <dd>{secs(d.renders.p90_ms)}</dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="an-grid3">
            <Bars title="Top pages" rows={d.pages} label={(r) => r.page} />
            <Bars title="Where visitors come from" rows={d.referrers} label={(r) => r.source} note="Referring site of each page view." />
            <Bars title="Countries" rows={d.countries} label={(r) => r.country} />
            <Bars title="Devices" rows={d.devices} label={(r) => r.device} />
            <Bars title="Languages" rows={d.languages} label={(r) => (r.lang === 'zh' ? 'Chinese' : r.lang === 'en' ? 'English' : r.lang)} />
            <Bars title="Most-viewed homes" rows={d.homes} label={(r) => r.name} value={(r) => r.views} note="Buyer views of share pages." />
          </div>

          <section className="an-card an-card--wide">
            <h3>Actions</h3>
            <div className="tablewrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">Event</th>
                    <th scope="col">Times</th>
                    <th scope="col">People</th>
                  </tr>
                </thead>
                <tbody>
                  {d.actions.map((r) => (
                    <tr key={r.name}>
                      <td>{r.name.replace(/_/g, ' ')}</td>
                      <td>{fmt(r.n)}</td>
                      <td>{fmt(r.people)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <p className="fine">
            Visitors, page views, the funnel, actions and engaged time come from people who allowed analytics. Accounts, homes, images, shares, buyer views and emails are counted for everyone. Vercel → sceneshare → Analytics has its own cookieless visitor counts.
          </p>
        </>
      )}
    </div>
  )
}

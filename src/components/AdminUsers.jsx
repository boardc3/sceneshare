import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { get, shown } from '../lib/api.js'
import { Link } from '../router.jsx'
import { Bars, fmtDay, fmtNum as fmt, Periods, storeDays, storedDays, Trend } from './Charts.jsx'

// /admin → Users (super admin only): growth, activation, plans, and every account's
// own activity, with one user's full timeline on click. Activity is the server's
// record of each signed-in request, so it doesn't depend on analytics consent.
const PERIODS = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
  [90, 'Last 90 days'],
  [365, 'Last year'],
]
const when = (s) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')
const ago = (s) => {
  if (!s) return '—'
  const m = Math.round((Date.now() - new Date(s).getTime()) / 60000)
  if (m < 2) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} days ago`
}
const COLS = [
  ['email', 'Account', (u) => u.email],
  ['plan', 'Plan', (u) => u.plan],
  ['created_at', 'Signed up', (u) => fmtDay(String(u.created_at).slice(0, 10))],
  ['last_active', 'Last active', (u) => ago(u.last_active)],
  ['active_days', 'Active days', (u) => fmt(u.active_days)],
  ['homes', 'Homes', (u) => fmt(u.homes)],
  ['renders', 'Images', (u) => fmt(u.renders)],
  ['credits_used', 'Credits used', (u) => fmt(u.credits_used)],
  ['shares', 'Shares', (u) => fmt(u.shares)],
  ['buyer_views', 'Buyer views', (u) => fmt(u.buyer_views)],
]

function UserDetail({ id, onClose }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState('')
  const [kind, setKind] = useState('')
  const box = useRef(null)
  useEffect(() => {
    box.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setD(null)
    get(`/api/admin?user=${encodeURIComponent(id)}`)
      .then(setD)
      .catch((e) => setErr(shown(e) || 'Could not load this user.'))
  }, [id])
  const rows = (d?.timeline || []).filter((r) => !kind || r.kind === kind)
  return (
    <section className="an-card an-user" aria-label="User detail" ref={box}>
      <div className="an-sechead">
        <h3>{d?.user?.email || 'Loading…'}</h3>
        <button type="button" className="linkbtn" onClick={onClose}>
          Close
        </button>
      </div>
      {err && <p className="banner banner--error">{err}</p>}
      {d && (
        <>
          <dl className="an-dl an-dl--grid">
            {[
              ['Name', d.user.name || '—'],
              ['Plan', `${d.user.plan}${d.user.plan_status ? ` · ${d.user.plan_status}` : ''}${d.user.plan_interval ? ` · ${d.user.plan_interval}` : ''}`],
              ['Signed up', when(d.user.created_at)],
              ['Last seen', when(d.user.last_seen_at)],
              ['Email verified', d.user.email_verified ? 'Yes' : 'No'],
              ['Terms accepted', d.user.terms_accepted_at ? when(d.user.terms_accepted_at) : 'Not yet'],
              ['Language', d.user.prefs?.lang === 'zh' ? 'Chinese' : 'English'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <h4>Homes ({d.homes.length})</h4>
          {!d.homes.length ? (
            <p className="an-note">No homes yet.</p>
          ) : (
            <div className="tablewrap">
              <table className="admin__table">
                <thead>
                  <tr>
                    <th scope="col">Home</th>
                    <th scope="col">Added</th>
                    <th scope="col">Photos</th>
                    <th scope="col">Rounds</th>
                    <th scope="col">Shares</th>
                    <th scope="col">Buyer views</th>
                    <th scope="col">Buyers</th>
                    <th scope="col">Last viewed</th>
                  </tr>
                </thead>
                <tbody>
                  {d.homes.map((h) => (
                    <tr key={h.id}>
                      <td>
                        <Link to={`/p/${h.id}`}>{h.name}</Link>
                      </td>
                      <td>{fmtDay(String(h.created_at).slice(0, 10))}</td>
                      <td>{h.photos}</td>
                      <td>{h.designs}</td>
                      <td>{h.shares}</td>
                      <td>{h.share_views}</td>
                      <td>{h.buyers}</td>
                      <td>{ago(h.last_viewed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="an-sechead">
            <h4>Activity ({rows.length})</h4>
            <div className="an-filters an-filters--tight" role="group" aria-label="Activity type">
              {[
                ['', 'All'],
                ['action', 'Actions'],
                ['page', 'Pages'],
                ['request', 'Requests'],
                ['error', 'Errors'],
              ].map(([k, label]) => (
                <button key={k} type="button" className="an-chip" aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ol className="an-timeline">
            {rows.map((r, i) => (
              <li key={i} className={`an-timeline__item an-timeline__item--${r.kind}`}>
                <span className="an-timeline__at">{when(r.at)}</span>
                <span className="an-timeline__kind">{r.kind}</span>
                <span className="an-timeline__what">
                  {r.what}
                  {r.status ? <span className={`errlog__code errlog__code--${r.status >= 500 ? 'error' : r.status >= 400 ? 'warning' : 'ok'}`}>{r.status}</span> : null}
                  {r.code ? <span className="an-note"> {r.code}</span> : null}
                  {r.detail && r.detail !== 'null' && <span className="an-timeline__detail">{String(r.detail).slice(0, 220)}</span>}
                </span>
              </li>
            ))}
          </ol>
          {d.creditHistory.length > 0 && (
            <details>
              <summary>Credit history ({d.creditHistory.length})</summary>
              <div className="tablewrap">
                <table className="admin__table">
                  <tbody>
                    {d.creditHistory.map((c, i) => (
                      <tr key={i}>
                        <td>{when(c.at)}</td>
                        <td>{c.delta > 0 ? `+${c.delta}` : c.delta}</td>
                        <td>{c.kind}</td>
                        <td>{c.pool}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </>
      )}
    </section>
  )
}

export default function AdminUsers() {
  const [days, setDays] = useState(() => storedDays('ss:admin:udays'))
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState(['last_active', -1])
  const [open, setOpen] = useState(null)
  const load = useCallback(() => {
    setBusy(true)
    setErr('')
    return get(`/api/admin?users=1&days=${days}`)
      .then((r) => setD(r.users))
      .catch((e) => setErr(shown(e) || 'Could not load users.'))
      .finally(() => setBusy(false))
  }, [days])
  useEffect(() => {
    load()
    storeDays('ss:admin:udays', days)
  }, [load, days])

  const rows = useMemo(() => {
    const list = (d?.users || []).filter((u) => !q || `${u.email} ${u.name || ''}`.toLowerCase().includes(q.toLowerCase()))
    const [k, dir] = sort
    return [...list].sort((a, b) => {
      const x = a[k] ?? ''
      const y = b[k] ?? ''
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir
    })
  }, [d, q, sort])

  const T = d?.totals || {}
  const A = d?.activation || {}
  const AP = d?.activationPct || {}
  return (
    <div className={`an ${busy && d ? 'is-busy' : ''}`}>
      <Periods days={days} onChange={setDays} options={PERIODS} busy={busy} onRefresh={load} refreshLabel={busy ? 'Loading…' : 'Refresh'} />
      {err && <p className="banner banner--error">{err}</p>}
      {!d ? (
        !err && <p className="fine">Loading users…</p>
      ) : (
        <>
          <ul className="an-kpis">
            {[
              ['Accounts', T.accounts, d.caps?.accounts ? `Of ${d.caps.accounts} early-access spots` : undefined],
              [`New, last ${d.days} days`, T.new_accounts],
              ['Active today', T.dau, 'Signed-in, last 24 h'],
              ['Active this week', T.wau, 'Last 7 days'],
              ['Active this month', T.mau, 'Last 30 days'],
              ['Paying', T.paying, 'Entry or Premium'],
            ].map(([k, v, sub]) => (
              <li key={k}>
                <span className="an-kpi__k">{k}</span>
                <span className="an-kpi__v">{fmt(v)}</span>
                {sub && <span className="an-kpi__sub">{sub}</span>}
              </li>
            ))}
          </ul>

          <div className="an-trends">
            <Trend title="Accounts (total)" data={d.growth} field="accounts" total={d.growth[d.growth.length - 1]?.accounts || 0} />
            <Trend title="New accounts" data={d.growth} field="signups" />
            <Trend title="Active accounts per day" data={d.growth} field="active" total={Math.max(0, ...d.growth.map((g) => g.active))} />
          </div>
          <p className="an-note">“Active accounts per day” shows its busiest day in the corner.</p>

          <div className="an-grid3">
            <Bars
              title="Activation"
              note="Share of all accounts that have ever…"
              rows={[
                ['Added a home', A.addedHome, AP.addedHome],
                ['Rendered an image', A.rendered, AP.rendered],
                ['Shared a home', A.shared, AP.shared],
                ['Had a buyer view', A.buyerViewed, AP.buyerViewed],
                ['Came back another day', A.returned, AP.returned],
              ].map(([k, n, pct]) => ({ k, n, pct }))}
              label={(r) => r.k}
              value={(r) => r.pct}
              show={(r) => `${r.pct}% · ${fmt(r.n)}`}
            />
            <Bars title="Plans" rows={d.plans} label={(r) => r.plan} />
          </div>

          {open && <UserDetail id={open} onClose={() => setOpen(null)} />}

          <section className="an-card an-card--wide">
            <div className="an-sechead">
              <h3>Users ({rows.length})</h3>
              <input className="an-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email or name" aria-label="Search users" />
            </div>
            <div className="tablewrap">
              <table className="admin__table an-users">
                <thead>
                  <tr>
                    {COLS.map(([k, label]) => (
                      <th key={k} scope="col" aria-sort={sort[0] === k ? (sort[1] > 0 ? 'ascending' : 'descending') : undefined}>
                        <button type="button" className="an-sort" onClick={() => setSort(([sk, dir]) => [k, sk === k ? -dir : k === 'email' || k === 'plan' ? 1 : -1])}>
                          {label}
                          {sort[0] === k ? (sort[1] > 0 ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((u) => (
                    <tr key={u.id} className={`an-users__row ${open === u.id ? 'is-open' : ''}`} onClick={() => setOpen(u.id)}>
                      {COLS.map(([k, , show]) => (
                        <td key={k}>{show(u)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="an-note">Click a row for that account’s homes and full activity timeline.</p>
          </section>
        </>
      )}
    </div>
  )
}

import { Fragment, useCallback, useEffect, useState } from 'react'
import { get, post, shown } from '../lib/api.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { Link } from '../router.jsx'
import AdminAnalytics from '../components/AdminAnalytics.jsx'
import AdminUsers from '../components/AdminUsers.jsx'
import AdminInputs from '../components/AdminInputs.jsx'

// Internal: what is happening on Sceneshare. Verified admin accounts only
// (ADMIN_EMAILS in Vercel; defaults to chris@ccolbert.com). Super admins
// (SUPER_ADMIN_EMAILS; defaults to chris@sceneset.ai and chris@ccolbert.com) also
// get the Users tab. English only.
const when = (s) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—')

function Table({ rows, cols, empty = 'Nothing yet.' }) {
  if (!rows?.length) return <p className="fine">{empty}</p>
  return (
    <div className="tablewrap">
      <table className="admin__table">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c[0]} scope="col">
                {c[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c[0]}>{c[1](r)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Admin() {
  const { user, ready, admin, superAdmin } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState(() => ({ '#analytics': 'analytics', '#errors': 'errors', '#users': 'users', '#inputs': 'inputs' })[location.hash] || 'overview')
  const go = (t) => {
    setTab(t)
    history.replaceState(null, '', t === 'overview' ? location.pathname : `#${t}`)
  }
  const load = () =>
    get('/api/admin')
      .then((d) => setData(d))
      .catch((e) => setError(shown(e) || 'Could not load.'))
  useEffect(() => {
    if (ready && admin) load()
  }, [ready, admin])

  if (!ready) return <main id="main" className="page page--center"><span className="spinner" aria-hidden="true" /></main>
  if (!user || !admin) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">Admin</h1>
        <p>{user ? 'This page is for Sceneshare administrators with a verified email.' : 'Sign in with an administrator account.'}</p>
        {!user && (
          <button type="button" className="btn btn--glow" onClick={() => requireSignIn('account')}>
            Sign in
          </button>
        )}
      </main>
    )
  }
  if (error) return <main id="main" className="page"><p className="banner banner--error">{error}</p></main>
  if (!data) return <main id="main" className="page page--center"><span className="spinner" aria-hidden="true" /></main>

  const o = data.overview
  const T = o.totals
  return (
    <main id="main" className="page admin">
      <header className="account__head">
        <div>
          <p className="page__eyebrow">Admin · {when(data.at)}</p>
          <h1 className="page__title">Sceneshare activity</h1>
        </div>
        {tab === 'overview' && (
          <button type="button" className="btn btn--quiet btn--small" onClick={load}>
            Refresh
          </button>
        )}
      </header>
      <nav className="admin__tabs" aria-label="Admin sections">
        {[
          ['overview', 'Overview'],
          ['analytics', 'Analytics'],
          ['inputs', 'AI inputs'],
          ...(superAdmin ? [['users', 'Users']] : []),
          ['errors', 'Error log'],
        ].map(([k, label]) => (
          <button key={k} type="button" aria-current={tab === k ? 'page' : undefined} onClick={() => go(k)}>
            {label}
          </button>
        ))}
      </nav>
      {tab === 'analytics' && <AdminAnalytics />}
      {tab === 'errors' && <ErrorLog />}
      {tab === 'inputs' && <AdminInputs />}
      {tab === 'users' && superAdmin && <AdminUsers />}
      {tab === 'overview' && (
        <>
      <p className="fine">
        Page views, visitors, referrers and devices are also in Vercel → sceneshare → Analytics. Raw rows: Neon tables events, api_log, leads, properties, designs, renders.
      </p>

      <ul className="stats">
        {[
          ['Visitors (7 days)', T.visitors7d],
          ['Page views (7 days)', T.pageViews7d],
          ['Accounts', T.users],
          ['Emails (leads)', T.leads],
          ['Homes', T.properties],
          ['Designs', T.designs],
          ['Images made', T.renders],
          ['Buyer views', T.shareViews],
          ['Shares', T.shares],
          ['Share opens', T.shareOpens],
          ['Requests (24 h)', T.requests24h],
          ['Server errors (24 h)', T.errors24h],
          ['Events (24 h)', T.events24h],
          ['Open privacy requests', T.openPrivacyRequests],
        ].map(([k, v]) => (
          <li key={k} className={k.startsWith('Server errors') && v ? 'is-bad' : ''}>
            <span className="stats__v">{Number(v || 0).toLocaleString('en-US')}</span>
            <span className="stats__k">{k}</span>
          </li>
        ))}
      </ul>

      {o.engagement && <EngagementPanel e={o.engagement} />}

      <section>
        <h2>Privacy requests</h2>
        <Table rows={o.privacy} cols={[['When', (r) => when(r.at)], ['Kind', (r) => r.kind], ['Email', (r) => r.email], ['Status', (r) => r.status], ['Details', (r) => r.details || '']]} empty="No requests." />
      </section>

      <div className="admin__cols">
        <section>
          <h2>Top actions (7 days)</h2>
          <Table rows={o.topEvents} cols={[['Event', (r) => r.name], ['Count', (r) => r.n]]} />
        </section>
        <section>
          <h2>Top pages (7 days)</h2>
          <Table rows={o.topPages} cols={[['Path', (r) => r.path], ['Views', (r) => r.n]]} />
        </section>
      </div>

      <section>
        <h2>API routes (7 days)</h2>
        <Table rows={o.routes} cols={[['Route', (r) => r.route], ['Requests', (r) => r.n], ['Avg ms', (r) => r.avg_ms], ['4xx', (r) => r.rejected], ['5xx', (r) => r.errors]]} />
      </section>

      <section>
        <h2>Recent server errors</h2>
        <Table rows={o.errors} cols={[['When', (r) => when(r.at)], ['Route', (r) => r.route], ['Status', (r) => r.status], ['Code', (r) => r.code], ['ms', (r) => r.ms], ['Detail', (r) => (r.meta ? JSON.stringify(r.meta).slice(0, 120) : '')]]} empty="No server errors." />
      </section>

      <section>
        <h2>Recent browser errors</h2>
        <Table rows={o.clientErrors} cols={[['When', (r) => when(r.at)], ['Page', (r) => r.path], ['Message', (r) => String(r.props?.message || '').slice(0, 160)]]} empty="No browser errors." />
      </section>

      <section>
        <h2>Homes</h2>
        <Table
          rows={o.properties}
          cols={[
            ['Updated', (r) => when(r.updated_at)],
            ['Address', (r) => <Link to={`/p/${r.id}`}>{r.formatted_address || '(own photos)'}</Link>],
            ['Owner', (r) => r.owner_email],
            ['Photos', (r) => r.photos],
            ['Designs', (r) => r.designs],
            ['Buyer views', (r) => r.share_views],
          ]}
        />
      </section>

      <section>
        <h2>Plans</h2>
        <Table rows={o.plans || []} cols={[['Plan', (r) => r.plan], ['Source', (r) => r.source], ['Status', (r) => r.status], ['Accounts', (r) => r.n]]} />
        <h2>Terms acceptances and requests</h2>
        <Table rows={o.termsLog || []} cols={[['When', (r) => when(r.at)], ['What', (r) => r.kind], ['Who', (r) => r.who], ['Detail', (r) => r.detail]]} empty="None yet." />
        <h2>Billing log</h2>
        <Table rows={o.billing || []} cols={[['When', (r) => when(r.at)], ['Source', (r) => r.source], ['Event', (r) => r.type], ['Account', (r) => r.user_id || ''], ['Detail', (r) => (r.data ? JSON.stringify(r.data).slice(0, 120) : '')]]} empty="No billing activity yet." />
      </section>

      <section>
        <h2>Shares</h2>
        <Table rows={o.shares} cols={[['When', (r) => when(r.created_at)], ['Home', (r) => <Link to={`/p/${r.property_id}`}>{r.formatted_address || r.property_id}</Link>], ['How', (r) => r.channel], ['By', (r) => (r.by_owner ? 'owner' : 'buyer')], ['Recipients', (r) => r.recipient_count], ['Sent by us', (r) => (r.sent ? 'yes' : 'no')], ['Opens', (r) => r.opens]]} empty="No shares yet." />
      </section>

      <section>
        <h2>Designs</h2>
        <Table rows={o.designs} cols={[['Started', (r) => when(r.created_at)], ['Home', (r) => <Link to={`/p/${r.property_id}`}>{r.property_id}</Link>], ['Kind', (r) => (r.mode === 'polish' ? 'Relight' : r.mode === 'cleanup' ? 'Pro photo' : r.style)], ['Light', (r) => r.light], ['Status', (r) => r.status], ['Done', (r) => `${r.done}/${r.photos}`]]} />
      </section>

      <div className="admin__cols">
        <section>
          <h2>Accounts</h2>
          <Table rows={o.users} cols={[['Joined', (r) => when(r.created_at)], ['Email', (r) => r.email], ['Verified', (r) => (r.email_verified ? 'yes' : 'no')], ['Plan', (r) => (r.plan && r.plan !== 'free' ? `${r.plan === 'pro' ? 'Premium' : r.plan[0].toUpperCase() + r.plan.slice(1)} (${r.plan_source || ''}${r.period_end ? `, to ${when(r.period_end)}` : ''})` : 'Trial / none')], ['Last seen', (r) => when(r.last_seen_at)]]} />
        </section>
        <section>
          <h2>Emails</h2>
          <Table rows={o.leads} cols={[['Last seen', (r) => when(r.last_seen)], ['Email', (r) => r.email], ['Source', (r) => r.source || r.first_context || ''], ['Where', (r) => [r.region, r.country].filter(Boolean).join(', ')]]} />
        </section>
      </div>
        </>
      )}
    </main>
  )
}

const secs = (ms) => {
  const s = Math.round((ms || 0) / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}

// Session length and where visitors spend their time, from lib/engagement.js.
function EngagementPanel({ e }) {
  const byPage = {}
  for (const r of e.sections) (byPage[r.page] ||= []).push(r)
  return (
    <section>
      <h2>Time on site ({e.days} days)</h2>
      <ul className="stats">
        {[
          ['Sessions', e.sessions],
          ['Avg engaged time', secs(e.avgEngagedMs)],
          ['Median engaged time', secs(e.medianEngagedMs)],
          ['Avg session length (first → last event)', secs(e.avgSpanMs)],
          ['Pages per session', e.avgPages],
          ['Sessions over 1 min', e.overMinute],
        ].map(([k, v]) => (
          <li key={k}>
            <span className="stats__v">{typeof v === 'number' ? v.toLocaleString('en-US') : v}</span>
            <span className="stats__k">{k}</span>
          </li>
        ))}
      </ul>
      <p className="fine">Engaged time counts only while the tab is visible and the visitor has moved, scrolled or tapped in the last minute.</p>
      <div className="admin__cols">
        <section>
          <h3>Time by page type</h3>
          <Table rows={e.pages} cols={[['Page', (r) => r.page], ['Sessions', (r) => r.sessions], ['Total', (r) => secs(r.ms)], ['Avg per session', (r) => secs(r.avgMs)]]} empty="No engagement yet." />
        </section>
        <section>
          <h3>Where the time goes</h3>
          <Table
            rows={Object.entries(byPage).flatMap(([page, rows]) => {
              const total = rows.reduce((a, r) => a + r.ms, 0) || 1
              return rows.slice(0, 6).map((r) => ({ ...r, share: Math.round((r.ms / total) * 100) }))
            })}
            cols={[['Page', (r) => r.page], ['Section', (r) => r.section], ['Share of page time', (r) => `${r.share}%`], ['Total', (r) => secs(r.ms)], ['Sessions', (r) => r.sessions]]}
            empty="No section data yet."
          />
        </section>
      </div>
    </section>
  )
}

// The error log: every failed request (server and browser side) and every browser
// crash, newest first. Open = not yet reviewed. Click a row for the full details.
const SRC = { server: 'Server', api: 'Request (browser)', browser: 'Browser crash' }
const SHOWN = { inline: 'explained on the page', notice: 'error notice shown', prompt: 'own prompt (plan/terms/sign-in)', retried: 'retried automatically' }
function ErrorLog() {
  const [f, setF] = useState({ days: 7, source: '', level: '', open: true })
  const [d, setD] = useState(null)
  const [msg, setMsg] = useState('')
  const [expanded, setExpanded] = useState(null)
  const load = useCallback(() => {
    const q = new URLSearchParams({ errors: '1', days: String(f.days), ...(f.source ? { source: f.source } : {}), ...(f.level ? { level: f.level } : {}), ...(f.open ? { open: '1' } : {}) })
    return get(`/api/admin?${q}`)
      .then(setD)
      .catch((e) => setMsg(shown(e) || 'Could not load the error log.'))
  }, [f])
  useEffect(() => {
    load()
  }, [load])
  const review = async (body) => {
    try {
      const r = await post('/api/admin', { op: 'errors.review', ...body })
      setMsg(`${r.n} marked ${body.reviewed === false ? 'open' : 'reviewed'}.`)
      load()
    } catch (e) {
      setMsg(shown(e) || 'Could not update.')
    }
  }
  const T = d?.totals || {}
  const copy = (r) =>
    navigator.clipboard?.writeText(
      [`${when(r.at)} · ${SRC[r.source] || r.source} · ${r.level}`, `${r.method || ''} ${r.path || ''}`.trim(), `status ${r.status ?? '—'} · ${r.code || '—'}`, r.message && `message: ${r.message}`, r.page && `page: ${r.page}`, r.email && `user: ${r.email}`, r.request_id && `request: ${r.request_id}`, r.detail].filter(Boolean).join('\n'),
    )
  return (
    <section id="errors" className="errlog">
      <div className="errlog__head">
        <h2>Error log</h2>
        <button type="button" className="btn btn--quiet btn--small" onClick={load}>
          Refresh
        </button>
      </div>
      <ul className="stats">
        {[
          ['Open (not reviewed)', T.open],
          ['Open errors (5xx, crashes, network)', T.open_errors],
          ['Last 24 hours', T.day],
          [`All, last ${f.days} days`, T.n],
        ].map(([k, v]) => (
          <li key={k} className={k.startsWith('Open errors') && v ? 'is-bad' : ''}>
            <span className="stats__v">{Number(v || 0).toLocaleString('en-US')}</span>
            <span className="stats__k">{k}</span>
          </li>
        ))}
      </ul>
      <div className="errlog__filters">
        <label>
          Period{' '}
          <select value={f.days} onChange={(e) => setF({ ...f, days: Number(e.target.value) })}>
            {[1, 7, 30, 90, 180].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? '24 hours' : `${n} days`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Where{' '}
          <select value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>
            <option value="">All</option>
            {Object.entries(SRC).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Level{' '}
          <select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
            <option value="">Errors and warnings</option>
            <option value="error">Errors only</option>
            <option value="warning">Warnings only (4xx)</option>
          </select>
        </label>
        <label className="errlog__check">
          <input type="checkbox" checked={f.open} onChange={(e) => setF({ ...f, open: e.target.checked })} /> Open only
        </label>
        <button type="button" className="btn btn--quiet btn--small" onClick={() => window.confirm('Mark every open error as reviewed?') && review({ all: true })} disabled={!T.open}>
          Mark all reviewed
        </button>
      </div>
      {msg && <p className="fine">{msg}</p>}

      {d?.summary?.length > 0 && (
        <details className="errlog__summary">
          <summary>Most frequent ({d.summary.length})</summary>
          <Table rows={d.summary} cols={[['Where', (r) => SRC[r.source] || r.source], ['Level', (r) => r.level], ['Code', (r) => r.code], ['Route / path', (r) => r.where_], ['Count', (r) => r.n], ['Open', (r) => r.open], ['Last', (r) => when(r.last_at)]]} />
        </details>
      )}

      {!d ? (
        <p className="fine">Loading…</p>
      ) : !d.rows.length ? (
        <p className="fine">{f.open ? 'No open errors. 🎉' : 'No errors in this period.'}</p>
      ) : (
        <div className="tablewrap">
          <table className="admin__table errlog__table">
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Where</th>
                <th scope="col">Status</th>
                <th scope="col">Request</th>
                <th scope="col">Message</th>
                <th scope="col">User</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <Fragment key={r.id}>
                  <tr className={`errlog__row errlog__row--${r.level} ${r.reviewed_at ? 'is-reviewed' : ''}`} onClick={() => setExpanded(expanded === r.id ? null : r.id)}>
                    <td>{when(r.at)}</td>
                    <td>{SRC[r.source] || r.source}</td>
                    <td>
                      <span className={`errlog__code errlog__code--${r.level}`}>{r.status ?? '—'}</span> {r.code}
                    </td>
                    <td className="errlog__path">
                      {r.method} {r.path || r.route || '—'}
                    </td>
                    <td className="errlog__msg">{r.message || '—'}</td>
                    <td>{r.email || (r.user_id ? r.user_id.slice(0, 8) : 'signed out')}</td>
                    <td>
                      <button
                        type="button"
                        className="linkbtn"
                        onClick={(e) => {
                          e.stopPropagation()
                          review({ ids: [r.id], reviewed: !r.reviewed_at })
                        }}
                      >
                        {r.reviewed_at ? 'Reopen' : 'Reviewed'}
                      </button>
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="errlog__detail">
                      <td colSpan={7}>
                        <dl>
                          {[
                            ['Page', r.page],
                            ['Shown to the user as', SHOWN[r.shown] || r.shown],
                            ['Request id', r.request_id],
                            ['Device · country · language', [r.device, r.country, r.lang].filter(Boolean).join(' · ')],
                            ['Reviewed', r.reviewed_at && when(r.reviewed_at)],
                          ]
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                              <div key={k}>
                                <dt>{k}</dt>
                                <dd>{v}</dd>
                              </div>
                            ))}
                        </dl>
                        {r.detail && <pre className="errlog__pre">{r.detail}</pre>}
                        <button type="button" className="btn btn--quiet btn--small" onClick={() => copy(r)}>
                          Copy details
                        </button>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

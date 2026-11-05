import { useEffect, useState } from 'react'
import { get, shown } from '../lib/api.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { Link } from '../router.jsx'

// Internal: what is happening on Sceneshare. Verified admin accounts only
// (ADMIN_EMAILS in Vercel; defaults to chris@ccolbert.com). English only.
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
  const { user, ready, admin } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
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
        <button type="button" className="btn btn--quiet btn--small" onClick={load}>
          Refresh
        </button>
      </header>
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

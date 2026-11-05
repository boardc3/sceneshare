import { useCallback, useEffect, useState } from 'react'
import { Bars, Delta, fmtDay, fmtDuration, fmtNum, Periods, storeDays, storedDays, Trend } from '../components/Charts.jsx'
import { useI18n } from '../i18n.js'
import { get, shown } from '../lib/api.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { Link } from '../router.jsx'

// /analytics: an owner's analytics, for their own homes only — how buyers found and
// used each share page. Your own visits are left out.
export default function Insights() {
  const { t, lang } = useI18n()
  const { user, ready } = useAuth()
  const [days, setDays] = useState(() => storedDays('ss:insights:days'))
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const load = useCallback(() => {
    setBusy(true)
    setErr('')
    return get(`/api/account?analytics=1&days=${days}`)
      .then((r) => setD(r.analytics))
      .catch((e) => setErr(shown(e) || t('err.generic')))
      .finally(() => setBusy(false))
  }, [days, t])
  useEffect(() => {
    if (!ready || !user) return
    load()
    storeDays('ss:insights:days', days)
  }, [ready, user, load, days])

  if (!ready) return <main id="main" className="page page--center"><span className="spinner" aria-hidden="true" /></main>
  if (!user) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">{t('ins.title')}</h1>
        <p>{t('ins.signin')}</p>
        <button type="button" className="btn btn--glow" onClick={() => requireSignIn('account')}>
          {t('nav.signin')}
        </button>
      </main>
    )
  }

  const n = (v) => fmtNum(v, lang)
  const dur = (ms) => fmtDuration(ms, lang)
  const words = { none: t('ins.d.none'), fresh: t('ins.d.fresh'), same: t('ins.d.same'), vs: t('ins.d.vs') }
  const T = d?.totals || {}
  const P = d?.previous || {}
  const periods = [
    [7, t('ins.p7')],
    [30, t('ins.p30')],
    [90, t('ins.p90')],
    [365, t('ins.p365')],
  ]
  return (
    <main id="main" className="page an an--owner">
      <header className="account__head">
        <div>
          <p className="page__eyebrow">{t('ins.eyebrow')}</p>
          <h1 className="page__title">{t('ins.title')}</h1>
        </div>
      </header>
      <p className="fine">{t('ins.lede')}</p>
      <div className={busy && d ? 'is-busy' : ''}>
        <Periods days={days} onChange={setDays} options={periods} range={d?.daily?.length ? `${fmtDay(d.daily[0].day, { lang })} – ${fmtDay(d.daily[d.daily.length - 1].day, { lang })}` : null} />
        {err && <p className="banner banner--error">{err}</p>}
        {!d ? (
          !err && <p className="fine">{t('ins.loading')}</p>
        ) : !d.homes.length ? (
          <div className="an-card">
            <p>{t('ins.noHomes')}</p>
            <Link to="/" className="btn btn--glow btn--small">
              {t('hero.find')}
            </Link>
          </div>
        ) : (
          <>
            <ul className="an-kpis">
              {[
                ['views', t('ins.k.views'), t('ins.k.viewsSub')],
                ['buyers', t('ins.k.buyers'), t('ins.k.buyersSub')],
                ['avg_ms', t('ins.k.time'), t('ins.k.timeSub'), dur],
                ['shares', t('ins.k.shares')],
                ['opens', t('ins.k.opens'), t('ins.k.opensSub')],
                ['leads', t('ins.k.leads'), t('ins.k.leadsSub')],
              ].map(([k, label, sub, f = n]) => (
                <li key={k}>
                  <span className="an-kpi__k">{label}</span>
                  <span className="an-kpi__v">{f(T[k])}</span>
                  <Delta now={T[k]} before={P[k]} words={words} />
                  {sub && <span className="an-kpi__sub">{sub}</span>}
                </li>
              ))}
            </ul>

            <div className="an-trends">
              <Trend title={t('ins.k.views')} data={d.daily} field="views" lang={lang} />
              <Trend title={t('ins.t.buyers')} data={d.daily} field="buyers" lang={lang} />
              <Trend title={t('ins.k.shares')} data={d.daily} field="shares" lang={lang} />
            </div>

            <section className="an-card an-card--wide">
              <h3>{t('ins.homes')}</h3>
              <div className="tablewrap">
                <table className="admin__table an-table">
                  <thead>
                    <tr>
                      <th scope="col">{t('ins.h.home')}</th>
                      <th scope="col">{t('ins.k.views')}</th>
                      <th scope="col">{t('ins.k.buyers')}</th>
                      <th scope="col">{t('ins.k.time')}</th>
                      <th scope="col">{t('ins.h.top')}</th>
                      <th scope="col">{t('ins.k.shares')}</th>
                      <th scope="col">{t('ins.h.last')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.homes.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <Link to={`/studio/${h.id}`}>{h.name}</Link>
                        </td>
                        <td>{n(h.views)}</td>
                        <td>{n(h.buyers)}</td>
                        <td>{h.avg_ms ? dur(h.avg_ms) : '—'}</td>
                        <td>{h.top_section ? t(`section.${h.top_section}`) : '—'}</td>
                        <td>{n(h.shares)}</td>
                        <td>{h.last_viewed ? new Date(h.last_viewed).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="an-grid3">
              <Bars
                title={t('ins.sections')}
                note={t('ins.sectionsNote')}
                rows={d.sections.slice(0, 7)}
                label={(r) => t(`section.${r.section}`)}
                value={(r) => r.ms}
                show={(r) => `${Math.round((r.ms / Math.max(1, d.sections.reduce((a, x) => a + x.ms, 0))) * 100)}%`}
                empty={t('ins.empty')}
                lang={lang}
              />
              <Bars title={t('ins.countries')} rows={d.countries} label={(r) => r.country} empty={t('ins.empty')} lang={lang} />
              <Bars title={t('ins.languages')} rows={d.languages} label={(r) => (r.lang === 'zh' ? t('ins.zh') : r.lang === 'en' ? t('ins.en') : r.lang)} empty={t('ins.empty')} lang={lang} />
            </div>
            <p className="fine">{t('ins.note')}</p>
          </>
        )}
      </div>
    </main>
  )
}

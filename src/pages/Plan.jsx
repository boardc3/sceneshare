import { useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { buyCredits, homesLeft, loadBilling, manageBilling, periodShare, setCancel, upgrade, useBilling } from '../lib/billing.js'
import { Link, useRouter } from '../router.jsx'

const money = (cents, lang) => new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100)
const day = (iso, lang) => new Date(iso).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })

function Meter({ label, used, limit, t }) {
  const unlimited = limit == null
  const share = unlimited ? 0 : Math.min(1, used / Math.max(1, limit))
  return (
    <div className="meter">
      <div className="meter__top">
        <span>{label}</span>
        <strong>{unlimited ? t('plan.usedUnlimited', { n: used }) : t('plan.usedOf', { n: used, max: limit })}</strong>
      </div>
      {!unlimited && (
        <div className={`meter__bar ${share >= 1 ? 'meter__bar--full' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(used, limit)} aria-label={label}>
          <span style={{ width: `${share * 100}%` }} />
        </div>
      )}
    </div>
  )
}

// Plan and billing: what the account is on, what's left, upgrade / manage / cancel.
export default function Plan() {
  const { t, lang } = useI18n()
  const { user, ready } = useAuth()
  const { billing: b, plans, prices, packs } = useBilling()
  const { navigate } = useRouter()
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  // Back from Stripe Checkout: read the subscription straight from Stripe.
  useEffect(() => {
    if (!user) return
    const q = new URLSearchParams(window.location.search)
    const back = q.get('checkout')
    const creditsBack = q.get('credits')
    loadBilling({ sync: true, session: creditsBack === 'success' ? q.get('session_id') : null }).then((nb) => {
      if (creditsBack === 'success') {
        setMsg({ ok: true, text: (nb?.credits?.packs ?? 0) > 0 ? t('credits.added') : t('credits.processing') })
        track('credits_buy_done', { mode: nb?.mode })
      }
      if (creditsBack === 'cancel') setMsg({ ok: false, text: t('credits.canceled') })
      if (creditsBack) navigate('/plan#credits', { replace: true })
      if (back === 'success') {
        setMsg({ ok: true, text: nb?.plan === 'pro' ? t('plan.welcome') : t('plan.processing') })
        track('upgrade_done', { mode: nb?.mode })
      }
      if (back === 'cancel') setMsg({ ok: false, text: t('plan.checkoutCanceled') })
      if (back) navigate('/plan', { replace: true })
    })
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // /plan#credits (from the nav meter or an out-of-credits prompt): scroll to the packs.
  const hasBilling = Boolean(b)
  useEffect(() => {
    if (!hasBilling) return
    const go = (id) => id === 'credits' && setTimeout(() => document.getElementById('credits')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    go(window.location.hash.slice(1))
    const on = (e) => go(e.detail)
    window.addEventListener('ss:hash', on)
    return () => window.removeEventListener('ss:hash', on)
  }, [hasBilling])

  if (!ready) return <main id="main" className="page page--center"><span className="spinner" aria-hidden="true" /></main>
  if (!user) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">{t('plan.title')}</h1>
        <p>{t('plan.signInBody')}</p>
        <button type="button" className="btn btn--glow" onClick={() => requireSignIn('account')}>
          {t('nav.signin')}
        </button>
      </main>
    )
  }
  if (!b) return <main id="main" className="page page--center"><span className="spinner" aria-hidden="true" /></main>

  const pro = b.plan === 'pro'
  const run = async (key, fn) => {
    setBusy(key)
    setMsg(null)
    try {
      const r = await fn()
      if (r?.redirecting) return // off to Stripe
      if (key === 'month' || key === 'year') setMsg({ ok: true, text: t('plan.welcome') })
      if (key === 'cancel') setMsg({ ok: true, text: t('plan.canceledMsg', { date: day(r.periodEnd, lang) }) })
      if (key === 'resume') setMsg({ ok: true, text: t('plan.resumedMsg') })
      if (key.startsWith('pack:')) setMsg({ ok: true, text: t('credits.bought', { n: packs?.[key.slice(5)]?.credits ?? '' }) })
    } catch (e) {
      setMsg({ ok: false, text: e.message || t('err.generic') })
    }
    setBusy(null)
  }
  const share = periodShare(b)
  const left = homesLeft(b)
  const managed = b.mode === 'test' || b.mode === 'live'
  const yearSave = prices ? prices.month.amount * 12 - prices.year.amount : 10000

  return (
    <main id="main" className="page plan">
      <p className="page__eyebrow">{user.email}</p>
      <h1 className="page__title">{t('plan.title')}</h1>
      <p className="settings__nav">
        <Link to="/account">{t('nav.homes')}</Link> · <Link to="/settings">{t('nav.settings')}</Link>
      </p>

      {(b.mode === 'preview' || b.mode === 'test') && (
        <p className={`plan__mode plan__mode--${b.mode}`} role="note">
          <strong>{t(`plan.mode.${b.mode}.short`)}</strong> {t(`plan.mode.${b.mode}.body`)}
        </p>
      )}
      {msg && (
        <p className={msg.ok ? 'plan__msg' : 'field__error'} role="status">
          {msg.text}
        </p>
      )}

      <section className="settings__card plan__current" aria-labelledby="p-current">
        <div className="plan__head">
          <div>
            <p className="plan__label">{t('plan.current')}</p>
            <h2 id="p-current">{pro ? 'Sceneshare Pro' : t('plan.freeName')}</h2>
          </div>
          {pro && b.daysLeft != null && (
            <div className="plan__days">
              <strong>{b.daysLeft}</strong>
              <span>{t('plan.daysLeft', { n: b.daysLeft })}</span>
            </div>
          )}
          {!pro && left != null && (
            <div className="plan__days">
              <strong>{left}</strong>
              <span>{t(left === 1 ? 'plan.homeLeft' : 'plan.homesLeft')}</span>
            </div>
          )}
        </div>

        {pro && b.source === 'admin' && <p className="fine">{t('plan.adminNote')}</p>}
        {pro && share != null && (
          <>
            <div className="meter__bar meter__bar--time" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t('plan.daysLeft', { n: b.daysLeft })}>
              <span style={{ width: `${share * 100}%` }} />
            </div>
            <p className="fine">
              {b.cancelAtPeriodEnd ? t('plan.endsOn', { date: day(b.periodEnd, lang) }) : t('plan.renewsOn', { date: day(b.periodEnd, lang), price: money(b.interval === 'year' ? prices?.year.amount || 50000 : prices?.month.amount || 5000, lang), per: t(b.interval === 'year' ? 'plan.perYear' : 'plan.perMonth') })}
              {b.status === 'past_due' && <> {t('plan.pastDue')}</>}
            </p>
          </>
        )}

        <div className="plan__meters">
          <Meter t={t} label={t('plan.m.homes')} used={b.usage.homes} limit={b.limits.homes} />
          {b.credits && !b.credits.unlimited && <Meter t={t} label={t('plan.m.credits')} used={b.credits.used} limit={b.credits.allotment} />}
          {!pro && <p className="fine">{t('plan.freeRules', { d: b.limits.designsPerHome, e: b.limits.emailsPerHome })}</p>}
        </div>

        <div className="settings__row plan__actions">
          {pro && managed && b.source === 'stripe' && (
            <button type="button" className="btn btn--ink btn--small" disabled={!!busy} onClick={() => run('portal', manageBilling)}>
              {busy === 'portal' ? t('auth.working') : t('plan.manage')}
            </button>
          )}
          {pro && b.mode === 'preview' && b.source === 'preview' && (
            b.cancelAtPeriodEnd ? (
              <button type="button" className="btn btn--ink btn--small" disabled={!!busy} onClick={() => run('resume', () => setCancel(false))}>
                {t('plan.resume')}
              </button>
            ) : (
              <button type="button" className="btn btn--quiet btn--small" disabled={!!busy} onClick={() => window.confirm(t('plan.cancelConfirm')) && run('cancel', () => setCancel(true))}>
                {t('plan.cancel')}
              </button>
            )
          )}
        </div>
      </section>

      {b.credits && !b.credits.unlimited && packs && (
        <section className="settings__card credits" id="credits" aria-labelledby="p-credits">
          <div className="plan__head">
            <div>
              <p className="plan__label">{t('credits.sectionTitle')}</p>
              <h2 id="p-credits">
                {b.credits.available} <span className="credits__of">{t('credits.available')}</span>
              </h2>
            </div>
            <div className="plan__days">
              <strong>{b.credits.resetsInDays}</strong>
              <span>{t('credits.daysToReset', { date: new Date(b.credits.resetsAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', ...(pro ? {} : { timeZone: 'UTC' }) }) })}</span>
            </div>
          </div>
          <p>{t('credits.sectionBody', { n: b.credits.allotment })}</p>
          {b.credits.packs > 0 && <p className="fine">{t('credits.extra')}: {t('credits.extraN', { n: b.credits.packs })}</p>}
          <div className="credits__packs">
            {Object.entries(packs).map(([key, pk]) => (
              <article key={key} className="credits__pack">
                <h3>{t('credits.pack', { n: pk.credits })}</h3>
                <p className="fine">{t('credits.packPer', { price: new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(pk.amount / 100 / pk.credits) })}</p>
                <button type="button" className="btn btn--ink btn--small" disabled={!!busy} onClick={() => run(`pack:${key}`, () => buyCredits(key))}>
                  {busy === `pack:${key}` ? t('auth.working') : t('credits.buyPack', { price: money(pk.amount, lang) })}
                </button>
              </article>
            ))}
          </div>
          <p className="fine">{managed ? t('plan.secure') : t('credits.previewNote')}</p>
        </section>
      )}

      {!pro && (
        <section className="plan__grid" aria-label={t('plan.compare')}>
          <article className="plan__card">
            <h2>{t('plan.freeName')}</h2>
            <p className="plan__price">{money(0, lang)}</p>
            <ul>
              {['f1', 'f2', 'f5', 'f3', 'f4'].map((k) => (
                <li key={k}>{t(`plan.free.${k}`, { d: plans?.free.designsPerHome ?? 2, e: plans?.free.emailsPerHome ?? 5, c: plans?.free.credits ?? 30 })}</li>
              ))}
            </ul>
            <p className="fine">{t('plan.youAreHere')}</p>
          </article>
          <article className="plan__card plan__card--pro">
            <h2>Sceneshare Pro</h2>
            <p className="plan__price">
              {money(prices?.month.amount || 5000, lang)} <span>{t('plan.perMonth')}</span>
            </p>
            <ul>
              {['p0', 'p1', 'p2', 'p3', 'p4', 'p5'].map((k) => (
                <li key={k}>{t(`plan.pro.${k}`)}</li>
              ))}
            </ul>
            <div className="plan__buy">
              <button type="button" className="btn btn--glow" disabled={!!busy} onClick={() => run('month', () => upgrade('month'))}>
                {busy === 'month' ? t('auth.working') : t('plan.buyMonth', { price: money(prices?.month.amount || 5000, lang) })}
              </button>
              <button type="button" className="btn btn--quiet" disabled={!!busy} onClick={() => run('year', () => upgrade('year'))}>
                {busy === 'year' ? t('auth.working') : t('plan.buyYear', { price: money(prices?.year.amount || 50000, lang), save: money(yearSave, lang) })}
              </button>
            </div>
            <p className="fine">{t(managed ? 'plan.secure' : 'plan.previewNote')}</p>
          </article>
        </section>
      )}

      <p className="fine plan__legal">
        {t('plan.legal')} <Link to="/terms#subscriptions">{t('legal.terms')}</Link>
      </p>
    </main>
  )
}

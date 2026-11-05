import { useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { buyCredits, buyExtra, changePlan, loadBilling, manageBilling, periodShare, planPrice, setCancel, subscribe, useBilling } from '../lib/billing.js'
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
  const { billing: b, plans, prices, packs, extra } = useBilling()
  const { navigate } = useRouter()
  const [busy, setBusy] = useState(null)
  const [msg, setMsg] = useState(null)

  // Back from Stripe Checkout: read the subscription straight from Stripe.
  useEffect(() => {
    if (!user) return
    const q = new URLSearchParams(window.location.search)
    const back = q.get('checkout')
    const creditsBack = q.get('credits')
    const extraBack = q.get('extra')
    loadBilling({ sync: true, session: creditsBack === 'success' || extraBack === 'success' ? q.get('session_id') : null }).then((nb) => {
      if (extraBack === 'success') setMsg({ ok: true, text: nb?.extras?.active ? t('extra.added') : t('credits.processing') })
      if (extraBack === 'cancel') setMsg({ ok: false, text: t('credits.canceled') })
      if (extraBack) navigate('/plan#extras', { replace: true })
      if (creditsBack === 'success') {
        setMsg({ ok: true, text: (nb?.credits?.packs ?? 0) > 0 ? t('credits.added') : t('credits.processing') })
        track('credits_buy_done', { mode: nb?.mode })
      }
      if (creditsBack === 'cancel') setMsg({ ok: false, text: t('credits.canceled') })
      if (creditsBack) navigate('/plan#credits', { replace: true })
      if (back === 'success') {
        setMsg({ ok: true, text: nb?.paid ? t('plan.welcome', { plan: t(`plan.name.${nb.plan}`) }) : t('plan.processing') })
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
    const go = (id) => (id === 'credits' || id === 'extras') && setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
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

  const paid = b.paid
  const run = async (key, fn, done) => {
    setBusy(key)
    setMsg(null)
    try {
      const r = await fn()
      if (r?.redirecting) return // off to Stripe
      if (done) setMsg({ ok: true, text: done(r) })
    } catch (e) {
      setMsg({ ok: false, text: e.message || t('err.generic') })
    }
    setBusy(null)
  }
  const share = periodShare(b)
  const managed = b.mode === 'test' || b.mode === 'live'
  const planName = t(`plan.name.${b.plan}`)
  const big = b.plan === 'trial' ? b.trial?.daysLeft : paid && b.source !== 'admin' ? b.daysLeft : null

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
      {b.plan === 'none' && (
        <section className="plan__expired" role="alert">
          <h2>{t('plan.expiredTitle')}</h2>
          <p>{t('plan.expiredBody')}</p>
        </section>
      )}

      <section className="settings__card plan__current" aria-labelledby="p-current">
        <div className="plan__head">
          <div>
            <p className="plan__label">{t('plan.current')}</p>
            <h2 id="p-current">
              {b.plan === 'none' ? planName : `Sceneshare ${planName}`}
              {b.extras?.active > 0 && <span className="plan__addons"> {t(b.extras.active === 1 ? 'extra.activeOne' : 'extra.activeMany', { n: b.extras.active })}</span>}
            </h2>
          </div>
          {big != null && (
            <div className="plan__days">
              <strong>{big}</strong>
              <span>{b.plan === 'trial' ? t('plan.trialDaysLeft') : t('plan.daysLeft')}</span>
            </div>
          )}
        </div>

        {b.source === 'admin' && <p className="fine">{t('plan.adminNote')}</p>}
        {b.plan === 'trial' && <p className="fine">{t('plan.trialBody', { h: b.limits.homes, c: b.limits.credits })}</p>}
        {share != null && (b.plan === 'trial' || (paid && b.source !== 'admin')) && (
          <>
            <div className="meter__bar meter__bar--time" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label={t('plan.daysLeft')}>
              <span style={{ width: `${share * 100}%` }} />
            </div>
            {paid && (
              <p className="fine">
                {b.cancelAtPeriodEnd ? t('plan.endsOn', { date: day(b.periodEnd, lang) }) : t('plan.renewsOn', { date: day(b.periodEnd, lang), price: money(planPrice(prices, b.plan, b.interval === 'year' ? 'year' : 'month'), lang), per: t(b.interval === 'year' ? 'plan.perYear' : 'plan.perMonth') })}
                {b.status === 'past_due' && <> {t('plan.pastDue')}</>}
              </p>
            )}
          </>
        )}

        <div className="plan__meters">
          <Meter t={t} label={t('plan.m.homes')} used={b.usage.homes} limit={b.limits.homes} />
          {b.credits && !b.credits.unlimited && <Meter t={t} label={t('plan.m.credits')} used={b.credits.used} limit={b.credits.allotment} />}
        </div>

        <div className="settings__row plan__actions">
          {paid && managed && b.source === 'stripe' && (
            <button type="button" className="btn btn--ink btn--small" disabled={!!busy} onClick={() => run('portal', manageBilling)}>
              {busy === 'portal' ? t('auth.working') : t('plan.manage')}
            </button>
          )}
          {paid && b.mode === 'preview' && b.source === 'preview' &&
            (b.cancelAtPeriodEnd ? (
              <button type="button" className="btn btn--ink btn--small" disabled={!!busy} onClick={() => run('resume', () => setCancel(false), () => t('plan.resumedMsg'))}>
                {t('plan.resume')}
              </button>
            ) : (
              <button type="button" className="btn btn--quiet btn--small" disabled={!!busy} onClick={() => window.confirm(t('plan.cancelConfirm')) && run('cancel', () => setCancel(true), (r) => t('plan.canceledMsg', { date: day(r.periodEnd, lang) }))}>
                {t('plan.cancel')}
              </button>
            ))}
        </div>
      </section>

      {b.source !== 'admin' && b.mode !== 'off' && prices && (
        <Tiers b={b} prices={prices} plans={plans} busy={busy} run={run} managed={managed} />
      )}

      {b.plan === 'premium' && b.source !== 'admin' && extra && (
        <section className="settings__card extras" id="extras" aria-labelledby="p-extras">
          <div className="plan__head">
            <div>
              <p className="plan__label">{t('extra.label')}</p>
              <h2 id="p-extras">{t('extra.title')}</h2>
            </div>
            <div className="plan__days">
              <strong>{b.extras?.active || 0}</strong>
              <span>{t('extra.running')}</span>
            </div>
          </div>
          <p>{t('extra.body', { homes: extra.homes, credits: extra.credits, days: extra.days, price: money(extra.amount, lang) })}</p>
          {b.extras?.items?.length > 0 && (
            <ul className="extras__list">
              {b.extras.items.map((x) => (
                <li key={x.id}>
                  <span>{t('extra.item', { homes: x.homes })}</span>
                  <span className="fine">{t('extra.until', { date: day(x.expiresAt, lang) })}</span>
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn--glow" disabled={!!busy} onClick={() => run('extra', () => buyExtra(), () => t('extra.added'))}>
            {busy === 'extra' ? t('auth.working') : t('extra.buy', { price: money(extra.amount, lang) })}
          </button>
          <p className="fine">{managed ? t('plan.secure') : t('credits.previewNote')}</p>
        </section>
      )}

      {b.credits && !b.credits.unlimited && packs && b.plan !== 'none' && (
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
              <span>{t('credits.daysToReset', { date: new Date(b.credits.resetsAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric', ...(paid || b.plan === 'trial' ? {} : { timeZone: 'UTC' }) }) })}</span>
            </div>
          </div>
          <p>{t('credits.sectionBody', { n: b.credits.allotment })}</p>
          {b.credits.packs > 0 && (
            <p className="fine">
              {t('credits.extra')}: {t('credits.extraN', { n: b.credits.packs })}
            </p>
          )}
          <div className="credits__packs">
            {Object.entries(packs).map(([key, pk]) => (
              <article key={key} className="credits__pack">
                <h3>{t('credits.pack', { n: pk.credits })}</h3>
                <p className="fine">{t('credits.packPer', { price: new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 3 }).format(pk.amount / 100 / pk.credits) })}</p>
                <button type="button" className="btn btn--ink btn--small" disabled={!!busy} onClick={() => run(`pack:${key}`, () => buyCredits(key), () => t('credits.bought', { n: pk.credits }))}>
                  {busy === `pack:${key}` ? t('auth.working') : t('credits.buyPack', { price: money(pk.amount, lang) })}
                </button>
              </article>
            ))}
          </div>
          <p className="fine">{managed ? t('plan.secure') : t('credits.previewNote')}</p>
        </section>
      )}

      <p className="fine plan__legal">
        {t('plan.legal')} <Link to="/terms#subscriptions">{t('legal.terms')}</Link>
      </p>
    </main>
  )
}

// Entry and Premium side by side, monthly or yearly.
function Tiers({ b, prices, plans, busy, run, managed }) {
  const { t, lang } = useI18n()
  const paid = b.paid
  const [interval, setIv] = useState(paid && b.interval === 'year' ? 'year' : 'month')
  const per = t(interval === 'year' ? 'plan.perYear' : 'plan.perMonth')
  const short = t(interval === 'year' ? 'plan.yr' : 'plan.mo')
  const locked = paid && b.source === 'stripe'

  return (
    <section className="tiers" aria-labelledby="p-choose">
      <div className="tiers__head">
        <h2 id="p-choose">{t('plan.choose')}</h2>
        <div className="segmented" role="group" aria-label={t('plan.choose')}>
          {['month', 'year'].map((iv) => (
            <button key={iv} type="button" aria-pressed={interval === iv} disabled={locked && iv !== interval} onClick={() => setIv(iv)}>
              {t(iv === 'year' ? 'plan.yearly' : 'plan.monthly')}
              {iv === 'year' && <span className="tiers__save">{t('plan.yearlySave')}</span>}
            </button>
          ))}
        </div>
      </div>
      {locked && <p className="fine">{t('plan.intervalLocked')}</p>}
      <div className="tiers__grid">
        {['entry', 'premium'].map((tier) => {
          const p = plans?.[tier] || { homes: tier === 'entry' ? 2 : 5, credits: tier === 'entry' ? 150 : 300 }
          const price = planPrice(prices, tier, interval)
          const current = paid && b.plan === tier
          const key = `tier:${tier}`
          const label = !paid
            ? t('plan.start', { plan: t(`plan.name.${tier}`), price: `${money(price, lang)}${short}` })
            : !current
              ? t('plan.switch', { plan: t(`plan.name.${tier}`), price: `${money(price, lang)}${short}` })
              : null
          const act = () =>
            !paid
              ? run(key, () => subscribe({ tier, interval }), () => t('plan.welcome', { plan: t(`plan.name.${tier}`) }))
              : run(key, () => changePlan({ tier }), () => t('plan.changed', { plan: t(`plan.name.${tier}`) }))
          return (
            <article key={tier} className={`plan__card tiers__card ${tier === 'premium' ? 'plan__card--pro' : ''} ${current ? 'is-current' : ''}`}>
              <p className="plan__label">{t(`plan.tier.${tier}.tag`)}</p>
              <h3>{t(`plan.name.${tier}`)}</h3>
              <p className="plan__price">
                {money(prices[tier][interval], lang)} <span>{per}</span>
              </p>
              <ul>
                <li>{t('plan.f.homes', { n: p.homes })}</li>
                <li>{t('plan.f.credits', { n: p.credits })}</li>
                <li>{t('plan.f.designs')}</li>
                <li>{t('plan.f.emails')}</li>
                <li>{t('plan.f.tracking')}</li>
                <li>{t('plan.f.lang')}</li>
                {tier === 'premium' && <li className="tiers__extra">{t('plan.f.extras')}</li>}
              </ul>
              {label ? (
                <button type="button" className={`btn ${tier === 'premium' ? 'btn--glow' : 'btn--ink'}`} disabled={!!busy} onClick={act}>
                  {busy === key ? t('auth.working') : label}
                </button>
              ) : (
                <p className="tiers__current">{t('plan.thisPlan')}</p>
              )}
            </article>
          )
        })}
      </div>
      <p className="fine">{t(managed ? 'plan.secure' : 'plan.previewNote')}</p>
    </section>
  )
}

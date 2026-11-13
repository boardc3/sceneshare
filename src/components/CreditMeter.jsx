import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { SHOW_PRICING, homesLeft, useBilling } from '../lib/billing.js'
import { Link } from '../router.jsx'

const R = 8
const C = 2 * Math.PI * R

// The nav's account status: a small ring and the credits left, opening on hover,
// focus or tap into the full picture — plan, days left, the month's allotment,
// bought credits and when the allotment resets.
export default function CreditMeter() {
  const { t, lang } = useI18n()
  const { billing: b } = useBilling()
  const [open, setOpen] = useState(false)
  const [bump, setBump] = useState(false)
  const box = useRef(null)
  const timer = useRef(null)
  const last = useRef(null)
  const panelId = useId()
  const c = b?.credits

  // A short pulse when the number changes (a render just spent a credit).
  useEffect(() => {
    if (c?.available == null) return
    if (last.current != null && last.current !== c.available) {
      setBump(true)
      const id = setTimeout(() => setBump(false), 700)
      last.current = c.available
      return () => clearTimeout(id)
    }
    last.current = c.available
  }, [c?.available])

  useEffect(() => {
    if (!open) return
    const out = (e) => !box.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', out)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', out)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  useEffect(() => () => clearTimeout(timer.current), [])

  if (!b || b.mode === 'off' || !c) return null

  const pro = b.plan === 'premium'
  const paid = b.paid
  const unlimited = c.unlimited
  const share = unlimited ? 1 : c.allotment ? c.planLeft / c.allotment : 0
  const low = !unlimited && c.available <= Math.max(5, c.allotment * 0.1)
  const empty = !unlimited && c.available <= 0
  const fmt = (n) => new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US').format(n)
  const date = (iso, utc = false) => new Date(iso).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', ...(utc ? { timeZone: 'UTC' } : {}) })
  const left = homesLeft(b)
  const early = Boolean(b.early)
  const planKey = early ? 'early' : b.plan

  const enter = (e) => {
    if (e.pointerType === 'touch') return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(true), 120)
  }
  const leave = (e) => {
    if (e.pointerType === 'touch') return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setOpen(false), 220)
  }
  const toggle = () => {
    setOpen((o) => {
      if (!o) track('credits_meter_open')
      return !o
    })
  }

  let sub = ''
  if (b.source === 'admin') sub = t('plan.badge.admin')
  else if (paid && b.daysLeft != null) sub = t(b.cancelAtPeriodEnd ? 'credits.subEnds' : 'credits.subRenews', { n: b.daysLeft, date: date(b.periodEnd) })
  else if (early) sub = t('early.sub')
  else if (b.plan === 'trial' && b.trial) sub = t('credits.subTrial', { n: b.trial.daysLeft, date: date(b.trial.endsAt) })
  else if (b.betaRequired) sub = t(b.betaEnded ? 'betaPay.endedTitle' : 'betaPay.title')
  else if (b.plan === 'none') sub = t('plan.expiredTitle')

  return (
    <div className={`cmeter ${open ? 'is-open' : ''} ${low ? 'cmeter--low' : ''} ${empty ? 'cmeter--empty' : ''} ${paid || b.source === 'admin' ? 'cmeter--pro' : ''} cmeter--${b.plan}`} ref={box} onPointerEnter={enter} onPointerLeave={leave} onBlur={(e) => !box.current?.contains(e.relatedTarget) && setOpen(false)}>
      <button
        type="button"
        className="cmeter__btn"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        onFocus={(e) => e.target.matches(':focus-visible') && setOpen(true)}
        aria-label={unlimited ? t('credits.aria.unlimited') : t('credits.aria', { n: c.available })}
      >
        <svg className="cmeter__ring" viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r={R} className="cmeter__track" />
          <circle cx="10" cy="10" r={R} className="cmeter__fill" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, share)))} />
          {c.packs > 0 && <circle cx="10" cy="2" r="2.2" className="cmeter__pack" />}
        </svg>
        <span className={`cmeter__n ${bump ? 'is-bump' : ''}`}>{unlimited ? '∞' : fmt(c.available)}</span>
        <span className="cmeter__unit">{t('credits.unit')}</span>
        {b.limits?.homes != null && (
          <span className="cmeter__homes" title={t('credits.homesNav', { n: b.usage?.homes ?? 0, max: b.limits.homes })}>
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 7.5 8 2.5l6 5V14H9.8v-3.6H6.2V14H2z" />
            </svg>
            {b.usage?.homes ?? 0}/{b.limits.homes}
            <span className="sr-only"> {t('credits.homesNav', { n: b.usage?.homes ?? 0, max: b.limits.homes })}</span>
          </span>
        )}
        <span className="cmeter__plan">{t(`plan.short.${planKey}`)}</span>
      </button>

      <div className="cmeter__panel" id={panelId} role="dialog" aria-label={t('credits.title')} hidden={!open}>
        <div className="cmeter__head">
          <div>
            <p className="cmeter__eyebrow">{b.plan === 'none' ? t('plan.name.none') : `Sceneshare ${t(`plan.name.${planKey}`)}`}{b.extras?.homes > 0 ? ` ${t('extra.activeHomes', { n: b.extras.homes })}` : ''}</p>
            {sub && <p className="cmeter__sub">{sub}</p>}
          </div>
          {(b.mode === 'preview' || b.mode === 'test') && <span className="cmeter__mode">{t(`plan.mode.${b.mode}.short`)}</span>}
        </div>

        <div className="cmeter__big">
          <strong>{unlimited ? '∞' : fmt(c.available)}</strong>
          <span>{unlimited ? t('credits.unlimited') : t('credits.available')}</span>
        </div>

        {!unlimited && (
          <>
            <div className="cmeter__bar" role="img" aria-label={t('credits.barAria', { used: c.used, max: c.allotment })}>
              <span className="cmeter__bar-left" style={{ width: `${share * 100}%` }} />
            </div>
            <dl className="cmeter__rows">
              {b.limits?.homes != null && (
                <div>
                  <dt>{t(early ? 'early.homes' : 'plan.m.homes')}</dt>
                  <dd>{t(early ? 'early.homesOf' : 'credits.homesOf', { n: b.usage?.homes ?? 0, max: b.limits.homes, left })}</dd>
                </div>
              )}
              <div>
                <dt>{t(early ? 'early.renders' : b.plan === 'trial' ? 'credits.trialCredits' : 'credits.monthly')}</dt>
                <dd>
                  {t('credits.ofLeft', { n: fmt(c.planLeft), max: fmt(c.allotment) })}
                </dd>
              </div>
              {(!early || c.packs > 0) && (
                <div>
                  <dt>{t('credits.extra')}</dt>
                  <dd>{c.packs > 0 ? t('credits.extraN', { n: fmt(c.packs) }) : '—'}</dd>
                </div>
              )}
              {c.resetsAt && (
                <div>
                  <dt>{t(b.plan === 'trial' ? 'credits.trialEnds' : 'credits.resets')}</dt>
                  <dd>{t('credits.resetsIn', { n: c.resetsInDays, date: date(c.resetsAt, !paid && b.plan !== 'trial') })}</dd>
                </div>
              )}
              {!early && (
                <div>
                  <dt>{t('credits.usedCycle')}</dt>
                  <dd>{fmt(c.usedThisCycle)}</dd>
                </div>
              )}
            </dl>
          </>
        )}
        <p className="cmeter__fine">{t('credits.explain')}{early ? ` ${t('early.fine')}` : ''}</p>
        <div className="cmeter__actions">
          {SHOW_PRICING && !unlimited && b.plan !== 'none' && !early && (
            <Link to="/plan#credits" className="btn btn--glow btn--small" onClick={() => (setOpen(false), track('credits_meter_buy'))}>
              {t('credits.buyMore')}
            </Link>
          )}
          <Link to="/plan" className="btn btn--quiet btn--small" onClick={() => setOpen(false)}>
            {paid ? t('credits.managePlan') : early ? t('early.details') : t('plan.seePlans')}
          </Link>
        </div>
      </div>
    </div>
  )
}

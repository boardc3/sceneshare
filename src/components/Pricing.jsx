import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { useRouter } from '../router.jsx'

// Public pricing on the landing page: the trial, the two plans and the
// pay-as-you-go add-ons. The server's billing module holds the real numbers;
// these mirror api/_lib/billing.js (PLANS, PRICES, EXTRA, CREDIT_PACKS).
const TIERS = [
  { key: 'trial', price: null, homes: 2, credits: 50 },
  { key: 'entry', price: 49, homes: 2, credits: 150 },
  { key: 'premium', price: 99, homes: 5, credits: 300 },
]

export default function Pricing() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { navigate } = useRouter()
  const start = async (from) => {
    track('pricing_cta', { from })
    const u = user || (await requireSignIn('pricing'))
    if (u) navigate('/plan')
  }
  return (
    <section className="pricing" aria-labelledby="pricing-h" id="pricing">
      <p className="story__eyebrow">{t('pricing.eyebrow')}</p>
      <h2 id="pricing-h">{t('pricing.title')}</h2>
      <p className="pricing__lede">{t('pricing.lede')}</p>
      <div className="pricing__grid">
        {TIERS.map((p) => (
          <article key={p.key} className={`plan__card pricing__card ${p.key === 'premium' ? 'plan__card--pro' : ''}`}>
            <p className="plan__label">{t(`pricing.${p.key}.tag`)}</p>
            <h3>{t(`plan.name.${p.key}`)}</h3>
            <p className="plan__price">
              {p.price == null ? t('pricing.free') : `$${p.price}`} <span>{p.price == null ? t('pricing.sevenDays') : t('plan.perMonth')}</span>
            </p>
            <ul>
              <li>{t('pricing.homes', { n: p.homes })}</li>
              <li>{t(p.key === 'trial' ? 'pricing.creditsTrial' : 'pricing.credits', { n: p.credits })}</li>
              <li>{t('pricing.share')}</li>
              {p.key === 'premium' && <li className="tiers__extra">{t('pricing.extraProps')}</li>}
            </ul>
            {p.price != null && <p className="fine">{t('pricing.yearly', { n: p.price * 10 })}</p>}
            <button type="button" className={`btn ${p.key === 'premium' ? 'btn--glow' : 'btn--ink'}`} onClick={() => start(p.key)}>
              {t(p.key === 'trial' ? 'pricing.ctaTrial' : 'pricing.cta')}
            </button>
          </article>
        ))}
      </div>
      <div className="pricing__addons">
        <h3>{t('pricing.addonsTitle')}</h3>
        <ul>
          <li>
            <strong>{t('pricing.addon.props.t')}</strong> {t('pricing.addon.props.b')}
          </li>
          <li>
            <strong>{t('pricing.addon.packs.t')}</strong> {t('pricing.addon.packs.b')}
          </li>
        </ul>
        <p className="fine">{t('pricing.note')}</p>
      </div>
    </section>
  )
}

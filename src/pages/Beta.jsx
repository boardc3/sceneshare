import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { useAuth } from '../lib/auth.js'
import { useBilling } from '../lib/billing.js'
import { Link } from '../router.jsx'

// /beta: the page beta testers are sent to — what Sceneshare is, how to test it,
// what the account includes, and the sign-up. Spots come from /api/account.
const STEPS = ['account', 'home', 'photos', 'pro', 'restyle', 'review', 'share', 'stats']
const ASKS = ['real', 'share', 'phone', 'tell']
const FACTS = ['allowance', 'credit', 'concept', 'rights', 'languages']
const MAIL = 'mailto:Chris@sceneset.ai?subject=Sceneshare%20beta%20feedback'

export default function Beta() {
  const { t } = useI18n()
  const { user, ready, full, beta } = useAuth()
  const { billing } = useBilling()
  const left = beta?.left
  const paidBeta = beta?.price > 0
  const price = paidBeta ? `$${beta.price / 100}` : ''
  const mustPay = Boolean(user && billing?.betaRequired)
  const closed = !user && beta && beta.max > 0 && left <= 0
  const join = () => {
    track('beta_join_click')
    window.dispatchEvent(new CustomEvent('ss:signin', { detail: { mode: 'signup', reason: 'beta' } }))
  }
  const cta = !ready ? null : mustPay && !full ? (
    <div className="beta__cta">
      <p className="beta__in">{t(billing.betaEnded ? 'betaPay.endedBody' : 'betaPay.body')}</p>
      <Link to="/plan#beta" className="btn btn--glow" onClick={() => track('beta_pay_click')}>
        {t('betaPay.cta', { price })}
      </Link>
    </div>
  ) : user && !full ? (
    <div className="beta__cta">
      <p className="beta__in">{t('beta.in')}</p>
      <Link to="/" className="btn btn--glow">
        {t('beta.start')}
      </Link>
      <Link to="/account" className="btn btn--quiet">
        {t('nav.homes')}
      </Link>
    </div>
  ) : closed || full ? (
    <div className="beta__cta">
      <p className="beta__in">{t('beta.full')}</p>
      <a className="btn btn--glow" href="mailto:Chris@sceneset.ai?subject=Sceneshare%20beta%20waitlist">
        {t('beta.waitlist')}
      </a>
    </div>
  ) : (
    <div className="beta__cta">
      <button type="button" className="btn btn--glow" onClick={join}>
        {t('beta.join')}
      </button>
      <p className="fine">
        {paidBeta ? t('betaPay.joinFine', { price, n: beta.days }) : t('beta.joinFine')}
      </p>
    </div>
  )
  return (
    <main id="main" className="page beta">
      <header className="beta__head">
        <p className="page__eyebrow">{t('beta.eyebrow')}</p>
        <h1 className="page__title">{t('beta.title')}</h1>
        <p className="beta__lede">{t(paidBeta ? 'betaPay.lede' : 'beta.lede', { price, n: beta?.days ?? 30 })}</p>
        {cta}
      </header>

      <section aria-labelledby="beta-how">
        <h2 id="beta-how">{t('beta.howTitle')}</h2>
        <ol className="beta__steps">
          {STEPS.map((k) => (
            <li key={k}>
              <strong>{t(`beta.step.${k}.t`)}</strong>
              <span>{t(`beta.step.${k}.b`)}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="beta__cols">
        <section className="settings__card" aria-labelledby="beta-ask">
          <h2 id="beta-ask">{t('beta.askTitle')}</h2>
          <ul>
            {ASKS.map((k) => (
              <li key={k}>{t(`beta.ask.${k}`)}</li>
            ))}
          </ul>
          <a className="btn btn--quiet btn--small" href={MAIL} onClick={() => track('beta_feedback_click')}>
            {t('beta.feedback')}
          </a>
        </section>
        <section className="settings__card" aria-labelledby="beta-know">
          <h2 id="beta-know">{t('beta.knowTitle')}</h2>
          <ul>
            {FACTS.map((k) => (
              <li key={k}>{t(`beta.know.${k}`, { h: beta?.homes ?? 5, c: beta?.renders ?? 100 })}</li>
            ))}
          </ul>
        </section>
      </div>
      {cta && <footer className="beta__foot">{cta}</footer>}
    </main>
  )
}

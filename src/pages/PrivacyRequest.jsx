import { useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { post, shown } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { isEmail } from '../lib/format.js'
import { LEGAL } from '../legal/entity.js'
import { Link } from '../router.jsx'

const KINDS = ['access', 'delete', 'correct', 'opt_out', 'limit', 'other']

// "Your Privacy Choices": California privacy requests for anyone, plus the
// instant self-service options for account holders.
export default function PrivacyRequest() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [kind, setKind] = useState('access')
  const [email, setEmail] = useState(user?.email || '')
  const [name, setName] = useState('')
  const [agent, setAgent] = useState(false)
  const [details, setDetails] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isEmail(email)) return setError(t('auth.err.email'))
    setBusy(true)
    try {
      const d = await post('/api/privacy', { kind, email: email.trim(), name: name.trim(), agent, details: details.trim(), lang })
      setDone(d.id)
      track('privacy_request', { kind })
    } catch (err) {
      setError(shown(err) || t('err.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main id="main" className="page legal">
      <p className="page__eyebrow">Sceneshare</p>
      <h1 className="page__title">{t('pr.title')}</h1>
      <p>{t('pr.lede')}</p>
      <ul className="pr__facts">
        <li>{t('pr.noSale')}</li>
        <li>{t('pr.signals')}</li>
      </ul>
      {user && (
        <p className="banner banner--info">
          {t('pr.self')} <Link to="/account">{t('nav.homes')}</Link>
        </p>
      )}
      {done ? (
        <p className="banner banner--ok" role="status">
          {t('pr.done', { id: done })}
        </p>
      ) : (
        <form className="pr__form" onSubmit={submit} noValidate>
          <fieldset className="choices choices--stack">
            <legend>{t('pr.kind')}</legend>
            {KINDS.map((k) => (
              <label key={k} className="choice">
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
                <span>{t(`pr.k.${k}`)}</span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            <span>{t('pr.email')}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span>{t('pr.name')}</span>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </label>
          <label className="check">
            <input type="checkbox" checked={agent} onChange={(e) => setAgent(e.target.checked)} />
            <span>{t('pr.agent')}</span>
          </label>
          <label className="field">
            <span>{t('pr.details')}</span>
            <textarea rows={4} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
          </label>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--glow" disabled={busy}>
            {busy ? t('auth.working') : t('pr.submit')}
          </button>
          <p className="fine">
            {t('pr.verify')} <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>
          </p>
        </form>
      )}
      <p className="legal__nav">
        <Link to="/privacy">{t('legal.privacy')}</Link>
      </p>
    </main>
  )
}

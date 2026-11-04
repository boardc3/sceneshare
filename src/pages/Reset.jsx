import { useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { resetPassword } from '../lib/auth.js'
import { Link } from '../router.jsx'

// The link in a password-reset email lands here with ?token=…
export default function Reset() {
  const { t } = useI18n()
  const q = new URLSearchParams(window.location.search)
  const token = q.get('token')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState(q.get('error') ? t('reset.expired') : '')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (pw.length < 8) return setError(t('auth.err.short'))
    if (pw !== pw2) return setError(t('reset.mismatch'))
    setBusy(true)
    const r = await resetPassword(token, pw)
    setBusy(false)
    if (r.error) return setError(r.error.code === 'INVALID_TOKEN' ? t('reset.expired') : t('auth.err.generic'))
    setDone(true)
    track('password_reset')
  }

  return (
    <main id="main" className="page page--narrow">
      <h1 className="page__title">{t('reset.title')}</h1>
      {done ? (
        <>
          <p className="banner banner--ok">{t('reset.done')}</p>
          <button type="button" className="btn btn--glow" onClick={() => window.dispatchEvent(new CustomEvent('ss:signin'))}>
            {t('nav.signin')}
          </button>
        </>
      ) : !token ? (
        <>
          <p>{t('reset.expired')}</p>
          <Link to="/" className="btn btn--quiet">
            {t('notfound.home')}
          </Link>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="auth">
          <label className="field">
            <span>{t('reset.new')}</span>
            <input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} minLength={8} required />
          </label>
          <label className="field">
            <span>{t('reset.again')}</span>
            <input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} minLength={8} required />
          </label>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--glow btn--block" disabled={busy}>
            {busy ? t('auth.working') : t('reset.save')}
          </button>
        </form>
      )}
    </main>
  )
}

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { isEmail } from '../lib/format.js'
import { onGateRequest, rememberEmail } from '../lib/api.js'
import { Link } from '../router.jsx'

export function Nav({ onSignIn, tone = 'light' }) {
  const { t, lang, setLang } = useI18n()
  return (
    <header className={`nav nav--${tone}`}>
      <Link to="/" className="wordmark" aria-label={t('brand')}>
        Sceneshare
      </Link>
      <nav className="nav__right" aria-label="Site">
        <div className="langtoggle" role="group" aria-label={t('nav.lang')}>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')} lang="en">
            EN
          </button>
          <button type="button" aria-pressed={lang === 'zh'} onClick={() => setLang('zh')} lang="zh-Hans">
            中文
          </button>
        </div>
        <button type="button" className="nav__signin" onClick={onSignIn}>
          {t('nav.signin')}
        </button>
      </nav>
    </header>
  )
}

function Modal({ labelledBy, onClose, children }) {
  const ref = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    const first = ref.current?.querySelector('input, button')
    first?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        {children}
      </div>
    </div>
  )
}

// Email capture: opens on the first submission of any kind (address search,
// photo upload, render, change request) and remembers the address afterwards.
export function EmailGate() {
  const { t, lang } = useI18n()
  const [req, setReq] = useState(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  useEffect(() => onGateRequest(setReq), [])
  if (!req) return null

  const close = (value) => {
    req.resolve(value)
    setReq(null)
    setError('')
  }
  const onSubmit = async (e) => {
    e.preventDefault()
    const v = email.trim()
    if (!isEmail(v)) return setError(t('gate.invalid'))
    await rememberEmail(v, lang, req.context)
    close(v)
  }
  return (
    <Modal labelledBy="gate-h" onClose={() => close(null)}>
      <form onSubmit={onSubmit} noValidate>
        <h2 id="gate-h">{t('gate.title')}</h2>
        <p>{t('gate.body')}</p>
        <label className="field">
          <span>{t('gate.email')}</span>
          <input
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? 'gate-err' : 'gate-fine'}
            required
          />
        </label>
        {error ? (
          <p className="field__error" id="gate-err" role="alert">
            {error}
          </p>
        ) : (
          <p className="fine" id="gate-fine">
            {t('gate.fine')}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet" onClick={() => close(null)}>
            {t('gate.cancel')}
          </button>
          <button type="submit" className="btn btn--glow">
            {t('gate.continue')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Accounts placeholder: the form is laid out and disabled so the real provider
// can be dropped in later (see api/auth.js and src/lib/auth.js).
export function AuthModal({ onClose }) {
  const { t } = useI18n()
  return (
    <Modal labelledBy="auth-h" onClose={onClose}>
      <h2 id="auth-h">{t('auth.title')}</h2>
      <p>{t('auth.body')}</p>
      <fieldset className="auth" disabled aria-describedby="auth-soon">
        <label className="field">
          <span>{t('auth.name')}</span>
          <input type="text" autoComplete="name" />
        </label>
        <label className="field">
          <span>{t('auth.email')}</span>
          <input type="email" autoComplete="email" />
        </label>
        <label className="field">
          <span>{t('auth.password')}</span>
          <input type="password" autoComplete="new-password" />
        </label>
        <div className="dialog__actions">
          <button type="button" className="btn btn--quiet">
            {t('auth.signin')}
          </button>
          <button type="button" className="btn btn--glow">
            {t('auth.create')}
          </button>
        </div>
      </fieldset>
      <p className="fine" id="auth-soon">
        {t('auth.soon')}
      </p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {t('auth.close')}
        </button>
      </div>
    </Modal>
  )
}

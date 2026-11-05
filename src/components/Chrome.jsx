import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { consent, gpc, onConsent, setConsent, track } from '../lib/analytics.js'
import { acceptTerms, currentUser, onAuthRequest, onTermsRequest, requestReset, signInEmail, signInGoogle, signOut, signUpEmail, useAuth } from '../lib/auth.js'
import { post } from '../lib/api.js'
import { loadBilling } from '../lib/billing.js'
import { isEmail } from '../lib/format.js'
import { Link, useRouter } from '../router.jsx'
import CreditMeter from './CreditMeter.jsx'
import PasswordInput from './PasswordInput.jsx'

export function Nav({ tone = 'light' }) {
  const { t, lang, setLang } = useI18n()
  const { user, ready, admin } = useAuth()
  const { navigate, path } = useRouter()
  const [menu, setMenu] = useState(false)
  // Keep the plan badge current as people move around (homes and designs change it).
  useEffect(() => {
    if (user) loadBilling()
  }, [user?.id, path]) // eslint-disable-line react-hooks/exhaustive-deps
  const ref = useRef(null)
  useEffect(() => {
    if (!menu) return
    const close = (e) => !ref.current?.contains(e.target) && setMenu(false)
    const esc = (e) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])
  const initial = (user?.name || user?.email || '?').trim()[0]?.toUpperCase()
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
        {ready && user && <CreditMeter />}
        {!ready ? (
          <span className="nav__signin nav__signin--wait" aria-hidden="true" />
        ) : user ? (
          <div className="acct" ref={ref}>
            <button type="button" className="acct__btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
              {user.image ? <img src={user.image} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{initial}</span>}
              <span className="sr-only">{t('nav.account')}</span>
            </button>
            {menu && (
              <div className="acct__menu" role="menu">
                <p className="acct__who">{user.email}</p>
                <button type="button" role="menuitem" onClick={() => (setMenu(false), navigate('/account'))}>
                  {t('nav.homes')}
                </button>
                <button type="button" role="menuitem" onClick={() => (setMenu(false), navigate('/plan'))}>
                  {t('nav.plan')}
                </button>
                <button type="button" role="menuitem" onClick={() => (setMenu(false), navigate('/settings'))}>
                  {t('nav.settings')}
                </button>
                {admin && (
                  <button type="button" role="menuitem" onClick={() => (setMenu(false), navigate('/admin'))}>
                    {t('nav.admin')}
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMenu(false)
                    await signOut()
                    navigate('/')
                  }}
                >
                  {t('nav.signout')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <button type="button" className="nav__signin" onClick={() => window.dispatchEvent(new CustomEvent('ss:signin'))}>
            {t('nav.signin')}
          </button>
        )}
      </nav>
    </header>
  )
}

// The one-time Terms of Service acceptance before sharing: the account confirms it
// has the rights and/or permission to share, and accepts the Terms. Opened by
// ensureTerms(), by the server answering terms_required, or by ?accept=terms.
export function TermsPrompt() {
  const { t } = useI18n()
  const { user, terms } = useAuth()
  const [req, setReq] = useState(null)
  const [rights, setRights] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  useEffect(
    () =>
      onTermsRequest((r) => {
        setRights(false)
        setAgree(false)
        setErr('')
        setReq(r)
        track('terms_prompt', { context: r.context })
      }),
    [],
  )
  useEffect(() => {
    const on = () => !req && setReq({ context: 'server', resolve: () => {} })
    window.addEventListener('ss:terms-required', on)
    return () => window.removeEventListener('ss:terms-required', on)
  }, [req])
  // From the "please accept" email: /studio/<id>?accept=terms
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.get('accept') !== 'terms' || !user || terms?.accepted) return
    setReq({ context: 'email', resolve: () => {} })
    q.delete('accept')
    window.history.replaceState(window.history.state, '', window.location.pathname + (q.toString() ? `?${q}` : ''))
  }, [user?.id, terms?.accepted]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!req) return null
  const close = (ok) => {
    req.resolve(ok)
    setReq(null)
  }
  const accept = async (e) => {
    e.preventDefault()
    if (!rights || !agree) return
    setBusy(true)
    setErr('')
    try {
      await acceptTerms(req.context)
      setBusy(false)
      close(true)
    } catch (e2) {
      setBusy(false)
      setErr(e2.message || t('err.generic'))
    }
  }
  return (
    <Modal labelledBy="terms-h" onClose={() => close(false)}>
      <p className="page__eyebrow">{t('terms.eyebrow')}</p>
      <h2 id="terms-h">{t('terms.title')}</h2>
      <p>{t('terms.body')}</p>
      <form onSubmit={accept} className="terms__form">
        <label className="check">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
          <span>{t('terms.rights')}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            {t('terms.agree')}{' '}
            <a href="/terms#sharing" target="_blank" rel="noreferrer">
              {t('legal.terms')}
            </a>{' '}
            ·{' '}
            <a href="/privacy" target="_blank" rel="noreferrer">
              {t('legal.privacy')}
            </a>
          </span>
        </label>
        {err && <p className="field__error">{err}</p>}
        <p className="fine">{t('terms.once')}</p>
        <div className="dialog__actions">
          <button type="submit" className="btn btn--glow" disabled={!rights || !agree || busy}>
            {busy ? t('auth.working') : t('terms.accept')}
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => close(false)}>
            {t('plan.notNow')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// Opens when the server says a plan limit was reached.
export function UpgradePrompt() {
  const { t } = useI18n()
  const { navigate } = useRouter()
  const [info, setInfo] = useState(null)
  useEffect(() => {
    const on = (e) => {
      setInfo(e.detail || {})
      loadBilling()
      track('plan_limit_hit', { limit: e.detail?.limit })
    }
    window.addEventListener('ss:plan-limit', on)
    return () => window.removeEventListener('ss:plan-limit', on)
  }, [])
  if (!info) return null
  const close = () => setInfo(null)
  return (
    <Modal labelledBy="upgrade-title" onClose={close}>
      <p className="page__eyebrow">{t('plan.limit.eyebrow')}</p>
      <h2 id="upgrade-title">{t(`plan.limit.${info.limit}.title`, { n: info.max })}</h2>
      <p>{t(`plan.limit.${info.limit}.body`, { n: info.max })}</p>
      <div className="dialog__actions">
        <button
          type="button"
          className="btn btn--glow"
          onClick={() => {
            close()
            navigate(info.limit === 'credits' ? '/plan#credits' : '/plan')
          }}
        >
          {info.limit === 'credits' ? t('credits.buyMore') : t('plan.seePro')}
        </button>
        <button type="button" className="btn btn--quiet" onClick={close}>
          {t('plan.notNow')}
        </button>
      </div>
    </Modal>
  )
}

export function Modal({ labelledBy, onClose, children, wide = false, locked = false }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  const lockRef = useRef(locked)
  closeRef.current = onClose
  lockRef.current = locked
  // Runs once per opening: focus moves in, Tab stays in, Escape closes, focus returns.
  useEffect(() => {
    const prev = document.activeElement
    const first = ref.current?.querySelector('input, select, textarea, button:not([data-skipfocus])')
    first?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape' && !lockRef.current) closeRef.current()
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll('button, input, a[href], select, textarea')].filter((x) => !x.disabled)
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault()
          f[f.length - 1].focus()
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault()
          f[0].focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.classList.add('is-modal')
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.classList.remove('is-modal')
      prev?.focus?.()
    }
  }, [])
  return (
    <div className="scrim" onMouseDown={(e) => !locked && e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? ' dialog--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} ref={ref}>
        {children}
      </div>
    </div>
  )
}

const AUTH_ERRORS = {
  INVALID_EMAIL_OR_PASSWORD: 'auth.err.invalid',
  USER_ALREADY_EXISTS: 'auth.err.exists',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'auth.err.exists',
  PASSWORD_TOO_SHORT: 'auth.err.short',
  PASSWORD_TOO_LONG: 'auth.err.long',
  INVALID_EMAIL: 'auth.err.email',
  VALIDATION_ERROR: 'auth.err.email',
  TOO_MANY_REQUESTS: 'auth.err.rate',
  http_429: 'auth.err.rate',
  network: 'err.network',
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}

// Sign in / create account: Google, or email and password. Opened by the nav, or
// by anything that needs an account (searching a home, starting with photos).
export function AuthModal() {
  const { t } = useI18n()
  const [req, setReq] = useState(null)
  const [mode, setMode] = useState('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(
    () =>
      onAuthRequest((r) => {
        setReq(r)
        setMode(r.mode || 'signin')
        setError('')
        setSent(false)
        track('auth_open', { reason: r.reason || null, mode: r.mode })
      }),
    [],
  )
  useEffect(() => {
    const open = () => {
      setReq({ mode: 'signin', reason: null, resolve: () => {} })
      setMode('signin')
      setError('')
      setSent(false)
      track('auth_open', { reason: 'nav' })
    }
    window.addEventListener('ss:signin', open)
    return () => window.removeEventListener('ss:signin', open)
  }, [])

  if (!req) return null
  const close = (user = null) => {
    req.resolve(user)
    setReq(null)
    setPassword('')
    setBusy(false)
  }
  const msg = (e) => t(AUTH_ERRORS[e?.code] || 'auth.err.generic')

  const google = async () => {
    setBusy(true)
    setError('')
    const r = await signInGoogle()
    if (!r.redirecting) {
      setBusy(false)
      setError(msg(r.error))
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!isEmail(email)) return setError(t('auth.err.email'))
    if (mode === 'forgot') {
      setBusy(true)
      await requestReset(email.trim())
      setBusy(false)
      setSent(true)
      track('password_reset_request')
      return
    }
    if (password.length < 8) return setError(t('auth.err.short'))
    setBusy(true)
    const r = mode === 'signup' ? await signUpEmail({ name: name.trim(), email: email.trim(), password }) : await signInEmail({ email: email.trim(), password })
    setBusy(false)
    if (r.error) {
      setError(msg(r.error))
      track('auth_error', { mode, code: r.error.code })
      return
    }
    close(currentUser())
  }

  const title = mode === 'signup' ? t('auth.createTitle') : mode === 'forgot' ? t('auth.forgotTitle') : t('auth.title')
  return (
    <Modal labelledBy="auth-h" onClose={() => close(null)}>
      <h2 id="auth-h">{title}</h2>
      {req.reason && mode !== 'forgot' && <p className="dialog__reason">{t(`auth.why.${req.reason}`)}</p>}
      {mode !== 'forgot' && (
        <>
          <button type="button" className="btn btn--google" onClick={google} disabled={busy}>
            <GoogleMark /> {t('auth.google')}
          </button>
          <p className="dialog__or">
            <span>{t('auth.or')}</span>
          </p>
        </>
      )}
      {sent ? (
        <p className="banner banner--ok" role="status">
          {t('auth.resetSent')}
        </p>
      ) : (
        <form onSubmit={submit} noValidate className="auth">
          {mode === 'signup' && (
            <label className="field">
              <span>{t('auth.name')}</span>
              <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
            </label>
          )}
          <label className="field">
            <span>{t('auth.email')}</span>
            <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span>{t('auth.password')}</span>
              <PasswordInput autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} required aria-describedby="pw-hint" />
              {mode === 'signup' && (
                <small id="pw-hint" className="fine">
                  {t('auth.pwHint')}
                </small>
              )}
            </label>
          )}
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--glow btn--block" disabled={busy}>
            {busy ? t('auth.working') : mode === 'signup' ? t('auth.create') : mode === 'forgot' ? t('auth.sendReset') : t('auth.signin')}
          </button>
          {mode === 'signup' && (
            <p className="fine">
              {t('auth.agree.1')} <Link to="/terms" onClick={() => close(null)}>{t('legal.terms')}</Link> {t('auth.agree.2')}{' '}
              <Link to="/privacy" onClick={() => close(null)}>{t('legal.privacy')}</Link>
              {t('auth.agree.3')}
            </p>
          )}
        </form>
      )}
      <div className="dialog__switch">
        {mode === 'signin' && (
          <>
            <button type="button" className="linkish" onClick={() => (setMode('signup'), setError(''))}>
              {t('auth.toSignup')}
            </button>
            <button type="button" className="linkish" onClick={() => (setMode('forgot'), setError(''), setSent(false))}>
              {t('auth.forgot')}
            </button>
          </>
        )}
        {mode !== 'signin' && (
          <button type="button" className="linkish" onClick={() => (setMode('signin'), setError(''), setSent(false))}>
            {t('auth.toSignin')}
          </button>
        )}
      </div>
    </Modal>
  )
}

// Asked at most once per browser session, only of visitors who are not signed
// in, and only on a shared home: "get updates about this home".
const ASKED = 'ss:email-asked'
export function EmailPrompt({ propertyId, address }) {
  const { t, lang } = useI18n()
  const { user, ready } = useAuth()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!ready || user) return
    let asked = false
    try {
      asked = sessionStorage.getItem(ASKED) === '1' || localStorage.getItem('ss:lead') === '1'
    } catch {
      asked = true
    }
    if (asked) return
    const timer = setTimeout(() => {
      try {
        sessionStorage.setItem(ASKED, '1')
      } catch {
        /* private mode */
      }
      setOpen(true)
      track('email_prompt_shown', null, { propertyId })
    }, 20000)
    return () => clearTimeout(timer)
  }, [ready, user, propertyId])

  if (!open) return null
  const close = () => {
    setOpen(false)
    if (!done) track('email_prompt_dismissed', null, { propertyId })
  }
  const submit = async (e) => {
    e.preventDefault()
    if (!isEmail(email)) return setError(t('gate.invalid'))
    try {
      await post('/api/lead', { email: email.trim(), lang, context: 'share', propertyId, consent: true })
      try {
        localStorage.setItem('ss:lead', '1')
      } catch {
        /* private mode */
      }
      setDone(true)
      track('email_prompt_submitted', null, { propertyId })
    } catch (err) {
      setError(err.message || t('err.generic'))
    }
  }
  return (
    <Modal labelledBy="gate-h" onClose={close}>
      {done ? (
        <>
          <h2 id="gate-h">{t('gate.thanks')}</h2>
          <p>{t('gate.thanksBody')}</p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--glow" onClick={close}>
              {t('gate.close')}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <h2 id="gate-h">{t('gate.title')}</h2>
          <p>{t('gate.body', { address: address || '' })}</p>
          <label className="field">
            <span>{t('gate.email')}</span>
            <input type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={!!error} required />
          </label>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <p className="fine">
            {t('gate.fine')} <Link to="/privacy">{t('legal.privacy')}</Link>
          </p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--quiet" onClick={close}>
              {t('gate.cancel')}
            </button>
            <button type="submit" className="btn btn--glow">
              {t('gate.continue')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

// Cookie notice. We set no advertising or cross-site cookies: one sign-in cookie
// (essential), local storage for preferences, and cookieless analytics a visitor
// can decline. Global Privacy Control is honoured automatically.
export function CookieBanner() {
  const { t } = useI18n()
  const [choice, setChoice] = useState(consent())
  const [force, setForce] = useState(false)
  useEffect(() => onConsent((v) => setChoice(v)), [])
  useEffect(() => {
    const open = () => setForce(true)
    window.addEventListener('ss:cookies', open)
    return () => window.removeEventListener('ss:cookies', open)
  }, [])
  if (choice && !force) return null
  const pick = (v) => {
    setConsent(v)
    setForce(false)
  }
  return (
    <section className="cookies" role="region" aria-label={t('cookies.title')}>
      <p>
        <strong>{t('cookies.title')}.</strong> {gpc() ? t('cookies.gpc') : t('cookies.body')} <Link to="/cookies">{t('cookies.more')}</Link>
      </p>
      <div className="cookies__actions">
        {gpc() ? (
          <button type="button" className="btn btn--glow btn--small" onClick={() => pick('essential')}>
            {t('cookies.ok')}
          </button>
        ) : (
          <>
            <button type="button" className="btn btn--quiet btn--small" onClick={() => pick('essential')}>
              {t('cookies.essential')}
            </button>
            <button type="button" className="btn btn--glow btn--small" onClick={() => pick('all')}>
              {t('cookies.accept')}
            </button>
          </>
        )}
      </div>
    </section>
  )
}

export function Footer() {
  const { t } = useI18n()
  return (
    <footer className="foot">
      <nav className="foot__links" aria-label={t('legal.nav')}>
        <Link to="/terms">{t('legal.terms')}</Link>
        <Link to="/privacy">{t('legal.privacy')}</Link>
        <Link to="/cookies">{t('legal.cookies')}</Link>
        <Link to="/privacy/request">{t('legal.choices')}</Link>
        <button type="button" className="linkish" onClick={() => window.dispatchEvent(new CustomEvent('ss:cookies'))}>
          {t('legal.cookieSettings')}
        </button>
      </nav>
      <p className="foot__made">{t('foot.made')}</p>
      <p className="foot__fine">{t('foot.disclaimer')}</p>
    </footer>
  )
}

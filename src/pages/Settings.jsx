import { useEffect, useState } from 'react'
import PasswordInput from '../components/PasswordInput.jsx'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { post, shown } from '../lib/api.js'
import { changePassword, refresh, requireSignIn, savePrefs, sendVerifyCode, signOut, signOutOthers, updateName, useAuth, verifyEmail } from '../lib/auth.js'
import { Link, useRouter } from '../router.jsx'

// Account settings: profile, security, preferences, email choices, your data.
export default function Settings() {
  const { t, setLang } = useI18n()
  const { navigate } = useRouter()
  const { user, ready, prefs } = useAuth()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState({})
  const [cur, setCur] = useState('')
  const [next, setNext] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  useEffect(() => setName(user?.name || ''), [user?.name])

  if (!ready) return <main id="main" className="page page--center"><span className="spinner" aria-hidden="true" /></main>
  if (!user) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">{t('settings.title')}</h1>
        <button type="button" className="btn btn--glow" onClick={() => requireSignIn('account')}>
          {t('nav.signin')}
        </button>
      </main>
    )
  }
  const note = (k, text, ok = true) => setMsg((m) => ({ ...m, [k]: { text, ok } }))
  const Note = ({ k }) => (msg[k] ? <p className={msg[k].ok ? 'fine settings__ok' : 'field__error'} role="status">{msg[k].text}</p> : null)

  const saveName = async (e) => {
    e.preventDefault()
    const r = await updateName(name.trim())
    note('name', r.error ? t('auth.err.generic') : t('settings.saved'), !r.error)
    track('settings_name')
  }
  const savePw = async (e) => {
    e.preventDefault()
    if (next.length < 8) return note('pw', t('auth.err.short'), false)
    const r = await changePassword(cur, next, true)
    if (r.error) return note('pw', r.error.code === 'INVALID_PASSWORD' ? t('settings.pwWrong') : r.error.code === 'CREDENTIAL_ACCOUNT_NOT_FOUND' ? t('settings.pwGoogle') : t('auth.err.generic'), false)
    setCur('')
    setNext('')
    note('pw', t('settings.pwChanged'))
    track('settings_password')
  }
  const others = async () => {
    const r = await signOutOthers()
    note('sessions', r.error ? t('auth.err.generic') : t('settings.othersDone'), !r.error)
    track('settings_signout_others')
  }
  const pref = async (patch) => {
    if (patch.lang) setLang(patch.lang)
    else await savePrefs(patch)
    note('prefs', t('settings.saved'))
    track('settings_prefs', patch)
  }
  const sendCode = async () => {
    const r = await sendVerifyCode(user.email)
    if (r.error) note('verify', t('account.verifyFailed'), false)
    else {
      setCodeSent(true)
      note('verify', t('account.codeSent', { email: user.email }))
    }
  }
  const submitCode = async (e) => {
    e.preventDefault()
    const r = await verifyEmail(user.email, code.trim())
    if (r.error) return note('verify', t('account.codeWrong'), false)
    await refresh()
    note('verify', t('account.verified'))
  }
  const deleteAccount = async (e) => {
    e.preventDefault()
    if (confirm !== 'DELETE') return
    setDeleting(true)
    try {
      await post('/api/account', { op: 'delete', confirm: 'DELETE' })
      track('account_delete')
      await signOut()
      navigate('/')
      window.alert(t('account.deleted'))
    } catch (err) {
      note('delete', shown(err) || t('err.generic'), false)
      setDeleting(false)
    }
  }
  const linkLang = prefs?.linkLang || prefs?.lang || 'en'

  return (
    <main id="main" className="page settings">
      <p className="page__eyebrow">{user.email}</p>
      <h1 className="page__title">{t('settings.title')}</h1>
      <p className="settings__nav">
        <Link to="/account">{t('nav.homes')}</Link>
      </p>

      <section className="settings__card" aria-labelledby="s-profile">
        <h2 id="s-profile">{t('settings.profile')}</h2>
        <form onSubmit={saveName} className="settings__row">
          <label className="field">
            <span>{t('auth.name')}</span>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <button type="submit" className="btn btn--ink btn--small" disabled={!name.trim() || name.trim() === user.name}>
            {t('settings.save')}
          </button>
        </form>
        <Note k="name" />
        <dl className="account__dl">
          <dt>{t('auth.email')}</dt>
          <dd>
            {user.email} {user.emailVerified ? <span className="tag tag--ok">{t('account.isVerified')}</span> : <span className="tag">{t('account.notVerified')}</span>}
          </dd>
        </dl>
        {!user.emailVerified && (
          <div className="verify">
            <p>{t('account.verifyWhy')}</p>
            {!codeSent ? (
              <button type="button" className="btn btn--quiet btn--small" onClick={sendCode}>
                {t('account.sendCode')}
              </button>
            ) : (
              <form className="verify__form" onSubmit={submitCode}>
                <label className="field">
                  <span>{t('account.code')}</span>
                  <input type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={10} />
                </label>
                <button type="submit" className="btn btn--ink btn--small" disabled={!code.trim()}>
                  {t('account.verify')}
                </button>
              </form>
            )}
            <Note k="verify" />
          </div>
        )}
      </section>

      <section className="settings__card" aria-labelledby="s-security">
        <h2 id="s-security">{t('settings.security')}</h2>
        <form onSubmit={savePw} className="settings__pw">
          <label className="field">
            <span>{t('settings.currentPw')}</span>
            <PasswordInput value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" />
          </label>
          <label className="field">
            <span>{t('reset.new')}</span>
            <PasswordInput value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </label>
          <button type="submit" className="btn btn--ink btn--small" disabled={!cur || !next}>
            {t('settings.changePw')}
          </button>
        </form>
        <p className="fine">{t('settings.pwNote')}</p>
        <Note k="pw" />
        <div className="settings__row">
          <button type="button" className="btn btn--quiet btn--small" onClick={others}>
            {t('settings.signOutOthers')}
          </button>
        </div>
        <Note k="sessions" />
      </section>

      <section className="settings__card" aria-labelledby="s-prefs">
        <h2 id="s-prefs">{t('settings.prefs')}</h2>
        <div className="settings__pref">
          <span>{t('settings.lang')}</span>
          <div className="seg seg--tiny">
            <button type="button" aria-pressed={(prefs?.lang || 'en') === 'en'} onClick={() => pref({ lang: 'en' })}>English</button>
            <button type="button" aria-pressed={prefs?.lang === 'zh'} onClick={() => pref({ lang: 'zh' })}>中文</button>
          </div>
        </div>
        <div className="settings__pref">
          <span>{t('settings.linkLang')}</span>
          <div className="seg seg--tiny">
            <button type="button" aria-pressed={linkLang === 'en'} onClick={() => pref({ linkLang: 'en' })}>English</button>
            <button type="button" aria-pressed={linkLang === 'zh'} onClick={() => pref({ linkLang: 'zh' })}>中文</button>
          </div>
        </div>
        <h3>{t('settings.emails')}</h3>
        <label className="check">
          <input type="checkbox" checked={prefs?.activityEmails !== false} onChange={(e) => pref({ activityEmails: e.target.checked })} />
          <span>{t('settings.activityEmails')}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={prefs?.productEmails === true} onChange={(e) => pref({ productEmails: e.target.checked })} />
          <span>{t('settings.productEmails')}</span>
        </label>
        <p className="fine">{t('settings.emailsNote')}</p>
        <div className="settings__row">
          <button type="button" className="btn btn--quiet btn--small" onClick={() => window.dispatchEvent(new CustomEvent('ss:cookies'))}>
            {t('legal.cookieSettings')}
          </button>
        </div>
        <Note k="prefs" />
      </section>

      <section className="settings__card" aria-labelledby="s-data">
        <h2 id="s-data">{t('account.yourData')}</h2>
        <p>{t('account.yourDataBody')}</p>
        <div className="settings__row">
          <a className="btn btn--quiet btn--small" href="/api/account?export=1" onClick={() => track('data_export')}>
            {t('account.download')}
          </a>
          <Link to="/privacy/request" className="btn btn--quiet btn--small">
            {t('legal.choices')}
          </Link>
        </div>
        <form className="account__danger" onSubmit={deleteAccount}>
          <h3>{t('account.deleteTitle')}</h3>
          <p>{t('account.deleteBody')}</p>
          <label className="field">
            <span>{t('account.deleteType')}</span>
            <input type="text" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
          </label>
          <button type="submit" className="btn btn--danger btn--small" disabled={confirm !== 'DELETE' || deleting}>
            {deleting ? t('auth.working') : t('account.deleteGo')}
          </button>
          <Note k="delete" />
        </form>
      </section>
    </main>
  )
}

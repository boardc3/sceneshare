import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { get, post } from '../lib/api.js'
import { refresh, requireSignIn, sendVerifyCode, signOut, useAuth, verifyEmail } from '../lib/auth.js'
import ShareStats from '../components/ShareStats.jsx'
import { Link, useRouter } from '../router.jsx'

// "My homes": every home the account searched or started, plus the account itself
// — verify email, download everything, delete everything.
export default function Account() {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const { user, ready, claimed } = useAuth()
  const [homes, setHomes] = useState(null)
  const [error, setError] = useState('')
  const [code, setCode] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [confirm, setConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await get('/api/properties?mine=1')
      setHomes(d.properties)
    } catch (e) {
      setError(e.message || t('err.generic'))
    }
  }, [t])

  useEffect(() => {
    if (ready && user) load()
  }, [ready, user, load])

  if (!ready) {
    return (
      <main id="main" className="page page--center">
        <span className="spinner" aria-hidden="true" />
      </main>
    )
  }
  if (!user) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">{t('account.signedOut')}</h1>
        <p>{t('account.signedOutBody')}</p>
        <p className="page__actions">
          <button type="button" className="btn btn--glow" onClick={() => requireSignIn('account')}>
            {t('nav.signin')}
          </button>
        </p>
      </main>
    )
  }

  const removeHome = async (h) => {
    const name = h.street_number ? `${h.street_number} ${h.route}` : t('studio.ownTitle')
    if (!window.confirm(t('account.deleteHomeConfirm', { name }))) return
    try {
      await post('/api/properties', { op: 'property.delete', propertyId: h.id, lang })
      track('property_delete', null, { propertyId: h.id })
      setHomes((list) => list.filter((x) => x.id !== h.id))
    } catch (e) {
      setError(e.message || t('err.generic'))
    }
  }

  const sendCode = async () => {
    setVerifyMsg('')
    const r = await sendVerifyCode(user.email)
    if (r.error) setVerifyMsg(t('account.verifyFailed'))
    else {
      setCodeSent(true)
      setVerifyMsg(t('account.codeSent', { email: user.email }))
      track('verify_code_sent')
    }
  }
  const submitCode = async (e) => {
    e.preventDefault()
    const r = await verifyEmail(user.email, code.trim())
    if (r.error) setVerifyMsg(t('account.codeWrong'))
    else {
      setVerifyMsg(t('account.verified'))
      setCodeSent(false)
      await refresh()
      load()
    }
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
      setError(err.message || t('err.generic'))
      setDeleting(false)
    }
  }

  return (
    <main id="main" className="page account">
      <header className="account__head">
        <div>
          <p className="page__eyebrow">{t('account.eyebrow')}</p>
          <h1 className="page__title">{t('account.title')}</h1>
        </div>
        <div className="account__new">
          <Link to="/" className="btn btn--glow btn--small">
            {t('account.find')}
          </Link>
          <Link to="/studio/new" className="btn btn--quiet btn--small">
            {t('nav.start')}
          </Link>
        </div>
      </header>

      {claimed > 0 && <p className="banner banner--ok">{t('account.claimed', { n: claimed })}</p>}
      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      {homes === null ? (
        <p className="account__loading">
          <span className="spinner spinner--small" aria-hidden="true" /> {t('studio.loading')}
        </p>
      ) : homes.length === 0 ? (
        <div className="account__empty">
          <p>{t('account.none')}</p>
          <Link to="/" className="btn btn--glow">
            {t('hero.find')}
          </Link>
        </div>
      ) : (
        <ul className="homes">
          {homes.map((h) => (
            <li key={h.id} className="home">
              <Link to={`/studio/${h.id}`} className="home__img">
                {h.cover ? <img src={h.cover} alt="" loading="lazy" /> : <span className="home__noimg">{t('account.noPhotos')}</span>}
              </Link>
              <div className="home__body">
                <h2 className="home__addr">
                  <Link to={`/studio/${h.id}`}>{h.street_number ? `${h.street_number} ${h.route}${h.unit ? ` #${h.unit}` : ''}` : t('studio.ownTitle')}</Link>
                </h2>
                {h.city && (
                  <p className="home__place">
                    {h.city}, {h.state} {h.zip}
                  </p>
                )}
                <p className="home__stats">{t('account.stats', { photos: h.photos, designs: h.designs, shares: h.shares || 0, views: h.share_views || 0 })}</p>
                {h.formatted_address && <ShareStats id={h.id} />}
                <div className="home__actions">
                  <Link to={`/studio/${h.id}`} className="btn btn--ink btn--small">
                    {t('account.open')}
                  </Link>
                  {h.formatted_address && (
                    <Link to={`/p/${h.id}`} className="btn btn--quiet btn--small">
                      {t('account.buyerPage')}
                    </Link>
                  )}
                  <button type="button" className="btn btn--quiet btn--small btn--danger" onClick={() => removeHome(h)}>
                    {t('account.deleteHome')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="account__me" aria-labelledby="me-h">
        <h2 id="me-h">{t('account.me')}</h2>
        <dl className="account__dl">
          <dt>{t('auth.email')}</dt>
          <dd>
            {user.email} {user.emailVerified ? <span className="tag tag--ok">{t('account.isVerified')}</span> : <span className="tag">{t('account.notVerified')}</span>}
          </dd>
          {user.name && (
            <>
              <dt>{t('auth.name')}</dt>
              <dd>{user.name}</dd>
            </>
          )}
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
            {verifyMsg && (
              <p className="fine" role="status">
                {verifyMsg}
              </p>
            )}
          </div>
        )}

        <div className="account__data">
          <h3>{t('account.yourData')}</h3>
          <p>{t('account.yourDataBody')}</p>
          <a className="btn btn--quiet btn--small" href="/api/account?export=1" onClick={() => track('data_export')}>
            {t('account.download')}
          </a>
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
        </form>
      </section>
    </main>
  )
}

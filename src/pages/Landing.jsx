import { useCallback, useEffect, useRef, useState } from 'react'
import AddressSearch from '../components/AddressSearch.jsx'
import Compare from '../components/Compare.jsx'
import HeroMap from '../components/HeroMap.jsx'
import Story from '../components/Story.jsx'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { post, rememberProperty } from '../lib/api.js'
import { requireSignIn, takeIntent, useAuth } from '../lib/auth.js'
import { Link, useRouter } from '../router.jsx'
import { DEMO } from '../demoMedia.js'

export default function Landing() {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState(null)

  const { ready, user } = useAuth()
  const resumed = useRef(false)

  // Searching saves the home to an account, so it needs one (Chris, 2026-11-04).
  const onFind = useCallback(
    async ({ address, placeId, unit }) => {
      setError('')
      track('address_search_start', { signedIn: false, unit: Boolean(unit) })
      const user = await requireSignIn('search', { type: 'search', address, placeId, unit })
      if (!user) return
      setBusy(true)
      try {
        const d = await post('/api/property', { address, placeId, unit, lang })
        rememberProperty(d.property)
        track('address_search', { county: d.property.address?.county || null, parcel: Boolean(d.property.parcel) }, { propertyId: d.property.id })
        setTarget(d.property.address)
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        setTimeout(() => navigate(`/studio/${d.property.id}`), reduce ? 200 : 2300)
      } catch (e) {
        track('address_search_failed', { code: e.code })
        setError(e.message || (e.code === 'network' ? t('err.network') : t('err.generic')))
        setBusy(false)
      }
    },
    [lang, navigate, t],
  )

  const startOwn = async (e) => {
    e.preventDefault()
    const user = await requireSignIn('own', { type: 'own' })
    if (user) navigate('/studio/new')
  }

  // Back from Google sign-in: carry on with what the visitor was doing.
  useEffect(() => {
    if (!ready || resumed.current) return
    resumed.current = true
    const intent = user ? takeIntent() : null
    if (intent?.type === 'search' && intent.address) onFind({ address: intent.address, placeId: intent.placeId, unit: intent.unit })
    if (intent?.type === 'own') navigate('/studio/new')
  }, [ready, user, onFind, navigate])

  return (
    <main id="main">
      <section className="hero">
        <HeroMap target={target} />
        <div className="hero__scrim" aria-hidden="true" />
        <div className="hero__inner">
          <h1 className="hero__title">{t('hero.title')}</h1>
          <p className="hero__lede">{t('hero.lede')}</p>
          <AddressSearch onFind={onFind} busy={busy} />
          {error && (
            <p className="hero__error" role="alert">
              {error}
            </p>
          )}
          <Link to="/studio/new" className="hero__own" onClick={startOwn}>
            {t('hero.own')}
          </Link>
        </div>
        <p className="hero__caption">{t('hero.mapcaption')}</p>
      </section>

      <Story />

      <section className="demo" aria-labelledby="demo-h">
        <div className="demo__text">
          <h2 id="demo-h">{t('demo.title')}</h2>
          <p>{t('demo.body')}</p>
          <p className="fine">{t('demo.note')}</p>
        </div>
        <div className="demo__frame">
          {DEMO ? (
            <Compare
              before={DEMO.before.src}
              after={DEMO.after.src}
              width={DEMO.before.width}
              height={DEMO.before.height}
              beforeLabel={t('demo.before')}
              afterLabel={t('demo.after')}
              alt={t('demo.title')}
              start={50}
              intro
            />
          ) : (
            <div className="demo__empty">{t('demo.placeholder')}</div>
          )}
        </div>
      </section>

      <section className="how" aria-labelledby="how-h">
        <h2 id="how-h">{t('how.title')}</h2>
        <ol className="how__steps">
          {[1, 2, 3].map((n) => (
            <li key={n}>
              <span className="how__n" aria-hidden="true">
                {n}
              </span>
              <h3>{t(`how.${n}.t`)}</h3>
              <p>{t(`how.${n}.b`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="pair" aria-label={t('lang.title')}>
        <div className="pair__block">
          <h2>{t('lang.title')}</h2>
          <p>{t('lang.body')}</p>
        </div>
        <div className="pair__sample" aria-hidden="true">
          <p lang="en">Living room, as photographed and as proposed.</p>
          <p lang="zh-Hans" className="zh">客厅：原始照片与设计提案。</p>
        </div>
        <div className="pair__block">
          <h2>{t('loc.title')}</h2>
          <p>{t('loc.body')}</p>
        </div>
      </section>
    </main>
  )
}

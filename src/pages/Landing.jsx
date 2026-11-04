import { useState } from 'react'
import AddressSearch from '../components/AddressSearch.jsx'
import Compare from '../components/Compare.jsx'
import HeroMap from '../components/HeroMap.jsx'
import { useI18n } from '../i18n.js'
import { cacheProperty, submit } from '../lib/api.js'
import { Link, useRouter } from '../router.jsx'
import { DEMO } from '../demoMedia.js'

export default function Landing() {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [target, setTarget] = useState(null)

  const onFind = async ({ address, placeId }) => {
    setError('')
    setBusy(true)
    try {
      const d = await submit('/api/property', { address, placeId, lang }, 'address_search')
      if (!d) return
      cacheProperty(d.property)
      setTarget(d.property.address)
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      setTimeout(() => navigate(`/studio/${d.property.id}`), reduce ? 200 : 2300)
    } catch (e) {
      setError(e.message || (e.code === 'network' ? t('err.network') : t('err.generic')))
      setBusy(false)
    }
  }

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
          <Link to="/studio/new" className="hero__own">
            {t('hero.own')}
          </Link>
        </div>
        <p className="hero__caption">{t('hero.mapcaption')}</p>
      </section>

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
              start={38}
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

import { useEffect, useState } from 'react'
import Compare from '../components/Compare.jsx'
import Facts from '../components/Facts.jsx'
import PropertyMap from '../components/PropertyMap.jsx'
import { creditText, useI18n } from '../i18n.js'
import { cachedProperty, get } from '../lib/api.js'
import { lotSqft } from '../lib/format.js'
import { Link } from '../router.jsx'

const chosen = (ph) => ph.versions?.find((v) => v.id === ph.chosen) || ph.versions?.[ph.versions.length - 1] || null

// What a remote buyer sees: the address, each room as photographed and as
// proposed, and the location. Read-only, bilingual, phone-first.
export default function Share({ id }) {
  const { t } = useI18n()
  const [property, setProperty] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    get(`/api/properties?id=${id}`)
      .then((d) => setProperty(d.property))
      .catch((e) => {
        const local = cachedProperty(id)
        if (local) setProperty(local)
        else setError(e.message || t('studio.notFound'))
      })
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (property?.address) document.title = `${property.address.formatted} — Sceneshare`
    return () => {
      document.title = 'Sceneshare'
    }
  }, [property])

  if (error) {
    return (
      <main id="main" className="share share--empty">
        <p>{error}</p>
        <Link to="/" className="btn btn--glow">
          {t('share.make')}
        </Link>
      </main>
    )
  }
  if (!property) {
    return (
      <main id="main" className="share share--empty">
        <p>{t('share.loading')}</p>
      </main>
    )
  }

  const photos = (property.photos || []).filter((p) => !p.hidden)
  const a = property.address

  return (
    <main id="main" className="share">
      <header className="share__head">
        <h1>{a ? `${a.streetNumber} ${a.route}${a.unit ? ` #${a.unit}` : ''}` : 'Sceneshare'}</h1>
        {a && (
          <p className="share__place">
            {a.city}, {a.state} {a.zip}
          </p>
        )}
        <p className="share__lede">{t('share.lede')}</p>
      </header>

      {property.facts && <Facts facts={property.facts} listing={property.listing} />}

      <section className="rooms" aria-label={t('share.rooms')}>
        {photos.map((p) => {
          const v = chosen(p)
          return (
            <article key={p.id} className="room">
              <Compare
                before={p.src}
                after={v?.src}
                width={p.width}
                height={p.height}
                beforeLabel={t('studio.current')}
                afterLabel={t('studio.upgraded')}
                alt={a?.formatted || ''}
              />
              <p className="room__credit">{creditText(p, t)}</p>
            </article>
          )
        })}
      </section>
      <p className="share__note">{t('share.proposalNote')}</p>

      {a && <PropertyMap address={a} parcel={property.parcel} pois={property.pois || []} lotSqft={lotSqft(property.facts)} />}

      <p className="share__cta">
        <Link to="/" className="btn btn--ink">
          {t('share.make')}
        </Link>
      </p>
    </main>
  )
}

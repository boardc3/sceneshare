import { useEffect, useMemo, useState } from 'react'
import { EmailPrompt } from '../components/Chrome.jsx'
import Compare from '../components/Compare.jsx'
import Facts from '../components/Facts.jsx'
import PropertyMap from '../components/PropertyMap.jsx'
import ShareBar from '../components/ShareBar.jsx'
import SidePicker from '../components/SidePicker.jsx'
import { creditText, useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { get } from '../lib/api.js'
import { defaultSides, designName, sideImage, shortSideLabel } from '../lib/designs.js'
import { lotSqft } from '../lib/format.js'
import { Link } from '../router.jsx'

// What a remote buyer sees: the address, every design the owner made — each room
// as photographed and as proposed, any two side by side — and the location.
// Read-only, bilingual, phone-first. No account needed.
export default function Share({ id }) {
  const { t, lang } = useI18n()
  const [property, setProperty] = useState(null)
  const [owner, setOwner] = useState(false)
  const [error, setError] = useState('')
  const [sides, setSides] = useState({ left: 'original', right: null })

  useEffect(() => {
    // ?s=<share> credits the open to the share that brought this buyer here.
    const s = new URLSearchParams(window.location.search).get('s')
    get(`/api/properties?id=${id}&view=1&lang=${lang}${s && /^[a-z0-9]{10}$/.test(s) ? `&s=${s}` : ''}`)
      .then((d) => {
        setProperty(d.property)
        setOwner(d.owner)
        setSides(defaultSides(d.property))
      })
      .catch((e) => setError(e.status === 404 ? t('share.gone') : e.message || t('err.generic')))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (property?.address) document.title = `${property.address.formatted} — Sceneshare`
  }, [property])

  const designs = useMemo(() => property?.designs || [], [property])

  if (error) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">{error}</h1>
        <p className="page__actions">
          <Link to="/" className="btn btn--glow">
            {t('share.make')}
          </Link>
        </p>
      </main>
    )
  }
  if (!property) {
    return (
      <main id="main" className="page page--center">
        <span className="spinner" aria-hidden="true" />
        <p>{t('share.loading')}</p>
      </main>
    )
  }

  const a = property.address
  const pick = (s) => {
    setSides(s)
    track('design_compare', { left: s.left, right: s.right }, { propertyId: id })
  }
  const showDesign = (designId) => pick({ left: sides.left === designId ? 'original' : sides.left, right: designId })

  return (
    <main id="main" className="share">
      {owner && (
        <p className="banner banner--info">
          {t('share.ownerNote')}{' '}
          <Link to={`/studio/${id}`}>{t('share.backToStudio')}</Link>
        </p>
      )}
      <header className="share__head">
        <p className="share__eyebrow">{t('share.eyebrow')}</p>
        <h1>{a ? `${a.streetNumber} ${a.route}${a.unit ? ` #${a.unit}` : ''}` : 'Sceneshare'}</h1>
        {a && (
          <p className="share__place">
            {a.city}, {a.state} {a.zip}
          </p>
        )}
        <p className="share__lede">{designs.length ? t('share.lede', { n: designs.length }) : t('share.ledeNone')}</p>
        <ShareBar id={id} address={a?.formatted || ''} />
      </header>

      {property.facts && <Facts facts={property.facts} listing={property.listing} />}

      {designs.length > 0 && (
        <section className="share__designs" aria-labelledby="sd-h">
          <h2 id="sd-h">{t('share.designs')}</h2>
          <ul className="designs__list">
            {designs.map((d, i) => {
              const cover = property.photos.map((p) => sideImage(property, d.id, p)).find(Boolean)
              return (
                <li key={d.id}>
                  <button type="button" className="dchip" aria-pressed={sides.right === d.id} onClick={() => showDesign(d.id)}>
                    <span className="dchip__img">{cover && <img src={cover.src} alt="" loading="lazy" />}</span>
                    <span className="dchip__txt">
                      <span className="dchip__n">{t('design.n', { n: i + 1 })}</span>
                      <span className="dchip__name">{designName(d, t)}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <SidePicker designs={designs} left={sides.left} right={sides.right} onChange={pick} />
        </section>
      )}

      <section className="rooms" aria-label={t('share.rooms')}>
        {property.photos.map((p) => {
          const L = sideImage(property, sides.left, p)
          const R = sides.right ? sideImage(property, sides.right, p) : null
          const altered = (side, img) => img && !img.original && side !== 'original'
          const label = (side, img) => `${shortSideLabel(property, side, t)}${altered(side, img) ? ` · ${t('share.altered')}` : ''}`
          const before = L || { src: p.src, original: true }
          const leftSide = L ? sides.left : 'original'
          return (
            <article key={p.id} className="room">
              <Compare
                key={`${before.src}-${R?.src}`}
                before={before.src}
                after={R?.src}
                width={p.width}
                height={p.height}
                beforeLabel={label(leftSide, before)}
                afterLabel={R ? label(sides.right, R) : ''}
                alt={a?.formatted || ''}
              />
              <p className="room__credit">
                {creditText(p, t)}
                {sides.right && !R && <> · {t('share.notInDesign')}</>}
              </p>
            </article>
          )
        })}
      </section>
      {designs.length > 0 && <p className="share__note">{t('share.proposalNote')}</p>}

      {a && <PropertyMap address={a} parcel={property.parcel} pois={property.pois || []} lotSqft={lotSqft(property.facts)} />}

      <section className="share__end">
        <h2>{t('share.sendTitle')}</h2>
        <ShareBar id={id} address={a?.formatted || ''} />
        <p className="share__cta">
          <Link to="/" className="btn btn--ink">
            {t('share.make')}
          </Link>
        </p>
      </section>

      {!owner && <EmailPrompt propertyId={id} address={a?.formatted || ''} />}
    </main>
  )
}

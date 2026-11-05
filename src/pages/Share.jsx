import { useEffect, useMemo, useState } from 'react'
import { EmailPrompt } from '../components/Chrome.jsx'
import Compare from '../components/Compare.jsx'
import Facts from '../components/Facts.jsx'
import PropertyMap from '../components/PropertyMap.jsx'
import ShareBar from '../components/ShareBar.jsx'
import SidePicker from '../components/SidePicker.jsx'
import { creditText, useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { get, post } from '../lib/api.js'
import { ensureTerms, useAuth } from '../lib/auth.js'
import { isEmail } from '../lib/format.js'
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
  const [gated, setGated] = useState(null) // { name, email } while the owner hasn't accepted the Terms
  const { terms } = useAuth()

  useEffect(() => {
    // ?s=<share> credits the open to the share that brought this buyer here.
    const s = new URLSearchParams(window.location.search).get('s')
    get(`/api/properties?id=${id}&view=1&lang=${lang}${s && /^[a-z0-9]{10}$/.test(s) ? `&s=${s}` : ''}`)
      .then((d) => {
        if (d.gated) {
          setGated(d.sharer || {})
          track('share_gated_view', null, { propertyId: id })
          return
        }
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
  if (gated) return <Gated id={id} sharer={gated} />
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
      {owner && !terms?.accepted && (
        <p className="banner banner--warn">
          {t('terms.hiddenOwner')}{' '}
          <button type="button" className="linkbtn" onClick={() => ensureTerms('share_page')}>
            {t('terms.review')}
          </button>
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

// The home isn't visible until its sharer accepts the Terms: say so, and let the
// visitor ask them with one click (stored, and emailed to the sharer).
function Gated({ id, sharer }) {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent | error
  const name = sharer.name || t('terms.gate.someone')
  useEffect(() => {
    document.title = `${t('terms.gate.title')} — Sceneshare`
  }, [t])
  const ask = async (e) => {
    e.preventDefault()
    setState('sending')
    try {
      const s = new URLSearchParams(window.location.search).get('s')
      await post('/api/terms', { propertyId: id, email: isEmail(email.trim()) ? email.trim() : undefined, s: s || undefined })
      setState('sent')
      track('terms_request', { withEmail: isEmail(email.trim()) }, { propertyId: id })
    } catch {
      setState('error')
    }
  }
  return (
    <main id="main" className="page page--center gated">
      <p className="page__eyebrow">Sceneshare</p>
      <h1 className="page__title">{t('terms.gate.title')}</h1>
      <p>{t('terms.gate.body', { name })}</p>
      {state === 'sent' ? (
        <p className="plan__msg" role="status">
          {t('terms.gate.sent', { name })}
        </p>
      ) : (
        <form className="gated__form" onSubmit={ask}>
          <label className="field">
            <span>{t('terms.gate.yourEmail')}</span>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <button type="submit" className="btn btn--glow" disabled={state === 'sending'}>
            {state === 'sending' ? t('auth.working') : t('terms.gate.cta', { who: sharer.email ? `${name} (${sharer.email})` : name })}
          </button>
          {state === 'error' && <p className="field__error">{t('err.generic')}</p>}
        </form>
      )}
      <p className="fine">{t('terms.gate.note')}</p>
    </main>
  )
}

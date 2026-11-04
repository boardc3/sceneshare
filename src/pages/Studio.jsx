import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddressSearch from '../components/AddressSearch.jsx'
import Compare from '../components/Compare.jsx'
import Facts from '../components/Facts.jsx'
import PropertyMap from '../components/PropertyMap.jsx'
import { creditText, useI18n } from '../i18n.js'
import { cacheProperty, cachedProperty, get, health, shrinkPhoto, submit } from '../lib/api.js'
import { lotSqft } from '../lib/format.js'
import { Link, useRouter } from '../router.jsx'

export const STYLES = ['signature', 'coastal-modern', 'pure-form', 'resort-living', 'timeless-estate', 'urban-penthouse', 'executive-modern', 'avant-garde']
export const LIGHTS = ['daylight', 'golden', 'twilight', 'original']
const ORDER = { zillow: 0, redfin: 0, owner: 1, streetview: 2, google: 3 }

const chosenVersion = (ph) => ph?.versions?.find((v) => v.id === ph.chosen) || ph?.versions?.[ph.versions.length - 1] || null

export default function Studio({ id }) {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const [property, setProperty] = useState(() => cachedProperty(id))
  const [missing, setMissing] = useState(false)
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('redesign')
  const [style, setStyle] = useState('signature')
  const [light, setLight] = useState('daylight')
  const [busy, setBusy] = useState({}) // photoId -> 'render' | 'feedback'
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [listing, setListing] = useState('idle')
  const [all, setAll] = useState(null) // { done, total }
  const [uploading, setUploading] = useState(false)
  const [features, setFeatures] = useState({})
  const [save, setSave] = useState('idle')
  const [copied, setCopied] = useState(false)
  const [locating, setLocating] = useState(false)
  const propRef = useRef(property)
  propRef.current = property

  useEffect(() => {
    health().then((h) => setFeatures(h.features || {}))
  }, [])

  // Load from this device, else from the server (a saved property).
  useEffect(() => {
    if (property?.id === id) return
    const c = cachedProperty(id)
    if (c) return setProperty(c)
    get(`/api/properties?id=${id}`)
      .then((d) => setProperty({ ...d.property, listingChecked: true }))
      .catch(() => setMissing(true))
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const update = useCallback((fn) => {
    setProperty((p) => {
      const next = fn(p)
      cacheProperty(next)
      return next
    })
  }, [])

  const updatePhoto = useCallback((photoId, fn) => update((p) => ({ ...p, photos: p.photos.map((ph) => (ph.id === photoId ? fn(ph) : ph)) })), [update])

  const sortedPhotos = useMemo(() => [...(property?.photos || [])].sort((a, b) => (ORDER[a.source] ?? 9) - (ORDER[b.source] ?? 9)), [property?.photos])

  useEffect(() => {
    if (!selected && sortedPhotos.length) setSelected(sortedPhotos[0].id)
  }, [sortedPhotos, selected])

  // Listing photos from Zillow / Redfin — runs once per property.
  useEffect(() => {
    if (!property || property.listingChecked || !property.address || listing !== 'idle') return
    setListing('looking')
    submit('/api/listing', { address: property.address, propertyId: property.id, lang }, 'listing_lookup')
      .then((d) => {
        if (!d) return setListing('idle')
        update((p) => ({
          ...p,
          listingChecked: true,
          facts: d.facts || p.facts,
          listing: d.listing,
          photos: [...d.photos, ...p.photos.filter((x) => x.source !== 'zillow' && x.source !== 'redfin')],
        }))
        setListing(d.found ? 'found' : d.reason === 'scraper_not_configured' ? 'off' : 'none')
        if (d.photos[0]) setSelected(d.photos[0].id)
      })
      .catch(() => setListing('none'))
  }, [property, listing, lang, update])

  // Save the snapshot buyers see (debounced) when the database is configured.
  const saveTimer = useRef(null)
  useEffect(() => {
    if (!features.sharing || !property?.address) return
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSave('saving')
      try {
        await submit('/api/properties', { property: propRef.current }, 'save')
        setSave('saved')
      } catch {
        setSave('idle')
      }
    }, 1500)
    return () => clearTimeout(saveTimer.current)
  }, [property, features.sharing])

  const photo = sortedPhotos.find((p) => p.id === selected) || null
  const version = chosenVersion(photo)
  const addressText = property?.address?.formatted || ''

  const render = useCallback(
    async (ph, opts = {}) => {
      setBusy((b) => ({ ...b, [ph.id]: opts.mode === 'feedback' ? 'feedback' : 'render' }))
      setError('')
      try {
        const d = await submit(
          '/api/render',
          { source: ph.src, photoId: ph.id, propertyId: propRef.current.id, lang, addressText, mode, style, light, ...opts },
          opts.mode === 'feedback' ? 'feedback' : 'render',
        )
        if (!d) return false
        updatePhoto(ph.id, (x) => ({ ...x, versions: [...(x.versions || []), d.version], chosen: d.version.id }))
        return true
      } catch (e) {
        setError(e.message || t('err.generic'))
        return false
      } finally {
        setBusy((b) => {
          const n = { ...b }
          delete n[ph.id]
          return n
        })
      }
    },
    [lang, addressText, mode, style, light, updatePhoto, t],
  )

  const renderAll = async () => {
    const todo = sortedPhotos.filter((p) => !p.hidden && !(p.versions || []).length)
    if (!todo.length) return
    setAll({ done: 0, total: todo.length })
    let i = 0
    let done = 0
    const worker = async () => {
      while (i < todo.length) {
        const ph = todo[i++]
        await render(ph)
        setAll({ done: ++done, total: todo.length })
      }
    }
    await Promise.all([worker(), worker()])
    setAll(null)
  }

  const applyFeedback = async (e) => {
    e.preventDefault()
    if (!photo || !version || !feedback.trim()) return
    const ok = await render(photo, { mode: 'feedback', current: version.src, feedback: feedback.trim(), light: 'original' })
    if (ok) setFeedback('')
  }

  const addFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    setError('')
    try {
      for (const f of files) {
        const image = await shrinkPhoto(f)
        const d = await submit('/api/upload', { image, propertyId: propRef.current.id, lang, addressText }, 'photo_upload')
        if (!d) break
        update((p) => ({ ...p, photos: [...p.photos, d.photo] }))
        setSelected(d.photo.id)
      }
    } catch (e) {
      setError(e.message || t('err.generic'))
    } finally {
      setUploading(false)
    }
  }

  const locate = async ({ address, placeId }) => {
    setLocating(true)
    setError('')
    try {
      const d = await submit('/api/property', { address, placeId, lang, propertyId: property.id }, 'address_search')
      if (!d) return
      const loc = d.property
      update((p) => ({ ...p, address: loc.address, parcel: loc.parcel, pois: loc.pois, listingChecked: false, photos: [...p.photos, ...loc.photos] }))
      setListing('idle')
    } catch (e) {
      setError(e.message || t('err.generic'))
    } finally {
      setLocating(false)
    }
  }

  const share = async () => {
    const url = `${window.location.origin}/p/${property.id}`
    if (!features.sharing) {
      setError(t('studio.shareOff'))
      return
    }
    await submit('/api/properties', { property: propRef.current }, 'save').catch(() => null)
    try {
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) await navigator.share({ title: addressText || 'Sceneshare', url })
      else await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt(t('studio.share'), url)
    }
  }

  if (missing && !property) {
    return (
      <main id="main" className="studio studio--empty">
        <p>{t('studio.notFound')}</p>
        <Link to="/" className="btn btn--glow">
          {t('hero.find')}
        </Link>
      </main>
    )
  }
  if (!property) {
    return (
      <main id="main" className="studio studio--empty">
        <p>{t('studio.loading')}</p>
      </main>
    )
  }

  const rendering = photo && busy[photo.id]
  const listingMsg = {
    looking: t('studio.listing.looking'),
    found: t('studio.listing.found', { n: property.photos.filter((p) => p.source === 'zillow' || p.source === 'redfin').length, src: property.listing?.used === 'redfin' ? 'Redfin' : 'Zillow' }),
    none: t('studio.listing.none'),
    off: t('studio.listing.off'),
  }[listing]

  return (
    <main id="main" className="studio">
      <header className="studio__head">
        <div>
          <h1 className="studio__address">{property.address ? `${property.address.streetNumber} ${property.address.route}${property.address.unit ? ` #${property.address.unit}` : ''}` : t('studio.ownTitle')}</h1>
          {property.address && (
            <p className="studio__place">
              {property.address.city}, {property.address.state} {property.address.zip}
            </p>
          )}
        </div>
        <div className="studio__actions">
          <span className="studio__save" aria-live="polite">
            {save === 'saving' ? t('studio.saving') : save === 'saved' ? t('studio.saved') : ''}
          </span>
          {features.sharing && property.address && (
            <button type="button" className="btn btn--quiet" onClick={() => navigate(`/p/${property.id}`)}>
              {t('studio.preview')}
            </button>
          )}
          <button type="button" className="btn btn--glow" onClick={share} disabled={!property.address}>
            {copied ? t('studio.shared') : t('studio.share')}
          </button>
        </div>
      </header>

      {property.facts && <Facts facts={property.facts} listing={property.listing} />}

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
        </p>
      )}

      <div className="workspace">
        <section className="viewer" aria-label={t('studio.photos')}>
          {photo ? (
            <>
              <Compare
                key={`${photo.id}-${version?.id || 'none'}`}
                before={photo.src}
                after={version?.src}
                width={photo.width}
                height={photo.height}
                beforeLabel={t('studio.current')}
                afterLabel={t('studio.upgraded')}
                alt={addressText}
              />
              <p className="viewer__credit">
                {creditText(photo, t)}
                {!version && !rendering && <span className="viewer__hint"> — {t('studio.noVersion')}</span>}
              </p>
              {rendering && (
                <div className="viewer__busy" role="status">
                  <span className="spinner" aria-hidden="true" /> {rendering === 'feedback' ? t('studio.applying') : t('studio.rendering')}
                </div>
              )}

              <div className="controls">
                <div className="seg seg--wide" role="group" aria-label={t('studio.mode.redesign')}>
                  <button type="button" aria-pressed={mode === 'redesign'} onClick={() => setMode('redesign')}>
                    {t('studio.mode.redesign')}
                  </button>
                  <button type="button" aria-pressed={mode === 'polish'} onClick={() => setMode('polish')}>
                    {t('studio.mode.polish')}
                  </button>
                </div>

                {mode === 'redesign' && (
                  <fieldset className="choices">
                    <legend>{t('studio.style')}</legend>
                    {STYLES.map((s) => (
                      <label key={s} className="choice">
                        <input type="radio" name="style" value={s} checked={style === s} onChange={() => setStyle(s)} />
                        <span>{t(`style.${s}`)}</span>
                      </label>
                    ))}
                  </fieldset>
                )}

                <fieldset className="choices choices--light">
                  <legend>{t('studio.light')}</legend>
                  {LIGHTS.map((l) => (
                    <label key={l} className={`choice choice--${l}`}>
                      <input type="radio" name="light" value={l} checked={light === l} onChange={() => setLight(l)} />
                      <span>{t(`light.${l}`)}</span>
                    </label>
                  ))}
                </fieldset>

                <div className="controls__go">
                  <button type="button" className="btn btn--glow btn--big" onClick={() => render(photo)} disabled={!!rendering || !features.render}>
                    {mode === 'polish' ? t('studio.renderPolish') : t('studio.render')}
                  </button>
                  <button type="button" className="btn btn--quiet" onClick={renderAll} disabled={!!all || !features.render || !sortedPhotos.length}>
                    {all ? t('studio.renderingAll', all) : t('studio.renderAll')}
                  </button>
                </div>

                {version && (
                  <form className="feedback" onSubmit={applyFeedback}>
                    <label htmlFor="fb" className="feedback__label">
                      {t('studio.feedback')}
                    </label>
                    <div className="feedback__row">
                      <input id="fb" type="text" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t('studio.feedbackPh')} maxLength={600} />
                      <button type="submit" className="btn btn--ink" disabled={!!rendering || !feedback.trim()}>
                        {rendering === 'feedback' ? t('studio.applying') : t('studio.apply')}
                      </button>
                    </div>
                    <p className="fine">{t('studio.feedbackNote')}</p>
                  </form>
                )}

                {(photo.versions || []).length > 0 && (
                  <div className="versions">
                    <h3>{t('studio.versions')}</h3>
                    <ul>
                      {photo.versions.map((v, i) => (
                        <li key={v.id}>
                          <button
                            type="button"
                            className="versions__thumb"
                            aria-pressed={version?.id === v.id}
                            onClick={() => updatePhoto(photo.id, (x) => ({ ...x, chosen: v.id }))}
                            title={v.feedback || t(v.style ? `style.${v.style}` : 'studio.mode.polish')}
                          >
                            <img src={v.src} alt={`${t('studio.versions')} ${i + 1}`} width={v.width} height={v.height} loading="lazy" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="versions__actions">
                      <span className="tag">{t('studio.chosen')}</span>
                      <a className="btn btn--quiet btn--small" href={version?.src} download={`sceneshare-${photo.id}.jpg`} target="_blank" rel="noreferrer">
                        {t('studio.download')}
                      </a>
                      <button type="button" className="btn btn--quiet btn--small" onClick={() => updatePhoto(photo.id, (x) => ({ ...x, hidden: !x.hidden }))}>
                        {photo.hidden ? t('studio.unhide') : t('studio.hide')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="viewer__empty">
              <p>{listing === 'looking' ? t('studio.listing.looking') : t('studio.empty')}</p>
            </div>
          )}
        </section>

        <aside className="rail" aria-label={t('studio.photos')}>
          <div className="rail__head">
            <h2>{t('studio.photos')}</h2>
            <span className="rail__count">{sortedPhotos.length}</span>
          </div>
          {listingMsg && (
            <p className={`rail__status rail__status--${listing}`} role="status">
              {listing === 'looking' && <span className="spinner" aria-hidden="true" />} {listingMsg}
            </p>
          )}
          <div className="rail__add">
            <label className="btn btn--ink btn--small">
              {t('studio.takePhoto')}
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => addFiles([...e.target.files])} disabled={uploading} />
            </label>
            <label className="btn btn--quiet btn--small">
              {t('studio.upload')}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addFiles([...e.target.files])} disabled={uploading} />
            </label>
          </div>
          {uploading && (
            <p className="rail__status" role="status">
              <span className="spinner" aria-hidden="true" /> {t('studio.uploading')}
            </p>
          )}
          <ul className="thumbs">
            {sortedPhotos.map((p) => {
              const v = chosenVersion(p)
              return (
                <li key={p.id} className={p.hidden ? 'is-hidden' : ''}>
                  <button type="button" aria-pressed={p.id === selected} onClick={() => setSelected(p.id)}>
                    <img src={v?.src || p.src} alt="" loading="lazy" width={p.width || undefined} height={p.height || undefined} />
                    {busy[p.id] && <span className="thumbs__busy spinner" aria-hidden="true" />}
                    {v && <span className="thumbs__done" aria-hidden="true" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>

      {property.address ? (
        <PropertyMap address={property.address} parcel={property.parcel} pois={property.pois} lotSqft={lotSqft(property.facts)} />
      ) : (
        <section className="location location--ask">
          <h2>{t('map.title')}</h2>
          <p>{t('studio.ownAddress')}</p>
          <AddressSearch onFind={locate} busy={locating} />
        </section>
      )}
    </main>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { addVersion, normalizeProperty, visiblePhotos } from '../../shared/model.js'
import AddressSearch from '../components/AddressSearch.jsx'
import Compare from '../components/Compare.jsx'
import Facts from '../components/Facts.jsx'
import HouseProgress from '../components/HouseProgress.jsx'
import PhotoRestyle from '../components/PhotoRestyle.jsx'
import PropertyMap from '../components/PropertyMap.jsx'
import ShareBar from '../components/ShareBar.jsx'
import ShareStats from '../components/ShareStats.jsx'
import SidePicker from '../components/SidePicker.jsx'
import { creditText, useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { get, health, post, recalledProperty, retriable, shrinkPhoto, sleep } from '../lib/api.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { defaultSides, designLabel, designName, sideImage, shortSideLabel } from '../lib/designs.js'
import { lotSqft } from '../lib/format.js'
import { useHouseRun } from '../lib/houseRun.js'
import { Link, useRouter } from '../router.jsx'

export const STYLES = ['signature', 'coastal-modern', 'pure-form', 'resort-living', 'timeless-estate', 'urban-penthouse', 'executive-modern', 'avant-garde']
export const LIGHTS = ['daylight', 'golden', 'twilight', 'original']
const ORDER = { zillow: 0, redfin: 0, owner: 1, streetview: 2, google: 3 }

// One request with patient retries (for single-photo actions).
async function withRetry(fn, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i >= tries || !retriable(e)) throw e
      await sleep(3000 * i)
    }
  }
}

export default function Studio({ id }) {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const { user, ready } = useAuth()
  const [property, setProperty] = useState(() => {
    const r = recalledProperty(id)
    return r ? normalizeProperty(r) : null
  })
  const [status, setStatus] = useState('loading') // loading | ready | missing | forbidden | signin
  const [features, setFeatures] = useState({})
  const [selected, setSelected] = useState(null)
  const [sides, setSides] = useState({ left: 'original', right: null })
  const [mode, setMode] = useState('redesign')
  const [style, setStyle] = useState('signature')
  const [light, setLight] = useState('daylight')
  const [note, setNote] = useState('')
  const [listing, setListing] = useState('idle')
  const [uploading, setUploading] = useState(false)
  const [locating, setLocating] = useState(false)
  const [starting, setStarting] = useState(false)
  const [busy, setBusy] = useState({}) // photoId -> 'feedback' | 'redo'
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [shared, setShared] = useState(0)
  const [prPhotos, setPrPhotos] = useState(null) // the clean-up / restyle pop-up, for these photos
  const [prBusy, setPrBusy] = useState(false)

  useEffect(() => {
    health().then((h) => setFeatures(h.features || {}))
  }, [])

  // The owner's full copy from the server; anyone else is sent to the buyer page.
  const load = useCallback(async () => {
    try {
      const d = await get(`/api/properties?id=${id}&full=1`)
      if (d.owner) {
        setProperty(normalizeProperty(d.property))
        setStatus('ready')
      } else {
        setStatus(user ? 'forbidden' : 'signin')
      }
    } catch (e) {
      setStatus(e.status === 404 || e.code === 'bad_id' ? 'missing' : 'error')
      setError(e.message || t('err.generic'))
    }
  }, [id, user, t])

  useEffect(() => {
    if (ready) load()
  }, [ready, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const photos = useMemo(() => [...(property?.photos || [])].sort((a, b) => (ORDER[a.source] ?? 9) - (ORDER[b.source] ?? 9)), [property?.photos])
  const designs = property?.designs || []

  useEffect(() => {
    if (!selected && photos.length) setSelected(photos[0].id)
    if (selected && photos.length && !photos.some((p) => p.id === selected)) setSelected(photos[0].id)
  }, [photos, selected])

  // Keep the comparison pointing at designs that exist.
  useEffect(() => {
    if (!property) return
    const valid = (s) => s === 'original' || designs.some((d) => d.id === s)
    if (!sides.right || !valid(sides.right) || !valid(sides.left)) {
      const def = defaultSides(property)
      if (def.right !== sides.right || !valid(sides.left)) setSides(def)
    }
  }, [property, designs, sides])

  // Listing photos from Zillow / Redfin — once per home, in the background.
  useEffect(() => {
    if (status !== 'ready' || !property?.address || property.listingChecked || listing !== 'idle') return
    setListing('looking')
    post('/api/listing', { propertyId: id, lang })
      .then((d) => {
        if (d.property) setProperty(normalizeProperty(d.property))
        else setProperty((p) => ({ ...p, listingChecked: true }))
        const n = d.property?.photos?.filter((p) => p.source === 'zillow' || p.source === 'redfin').length || 0
        setListing(d.found ? 'found' : d.reason === 'scraper_not_configured' ? 'off' : 'none')
        track('listing_lookup', { found: d.found, used: d.listing?.used || null, photos: n }, { propertyId: id })
      })
      .catch((e) => {
        setListing('error')
        track('listing_lookup_failed', { code: e.code }, { propertyId: id })
      })
  }, [status, property, listing, id, lang])

  const onRendered = useCallback((photoId, version) => setProperty((p) => addVersion(p, photoId, version)), [])
  const onFinished = useCallback((p) => p && setProperty(normalizeProperty(p)), [])
  const { run, go, stop, close } = useHouseRun({ propertyId: id, lang, onRendered, onFinished })

  const visible = useMemo(() => visiblePhotos({ photos }), [photos])
  const right = designs.find((d) => d.id === sides.right) || null
  const missing = right ? visible.filter((p) => !right.picks[p.id]) : []
  const photo = photos.find((p) => p.id === selected) || null
  const leftImg = sideImage(property, sides.left, photo)
  const rightImg = sides.right ? sideImage(property, sides.right, photo) : null
  const addressLine = property?.address ? `${property.address.streetNumber} ${property.address.route}${property.address.unit ? ` #${property.address.unit}` : ''}` : ''

  useEffect(() => {
    document.title = `${addressLine || t('studio.ownTitle')} — Sceneshare`
  }, [addressLine, t])

  // "Restyle this house": a new design, every visible photo, behind the loading block.
  const restyleHouse = async () => {
    if (!visible.length) return setError(t('studio.needPhotos'))
    setError('')
    setStarting(true)
    try {
      const d = await withRetry(() => post('/api/properties', { op: 'design.create', propertyId: id, mode, style, light, note: note.trim(), lang }))
      const next = normalizeProperty(d.property)
      setProperty(next)
      setSides({ left: 'original', right: d.design.id })
      setNote('')
      go(d.design, visible.map((p) => p.id), { label: designLabel(d.design, next.designs.length - 1, t) })
    } catch (e) {
      setError(e.message || t('err.generic'))
    } finally {
      setStarting(false)
    }
  }

  const finishDesign = (d) => {
    const ids = visible.filter((p) => !d.picks[p.id]).map((p) => p.id)
    if (ids.length) go(d, ids, { label: designLabel(d, designs.indexOf(d), t) })
  }

  const retryRun = () => {
    const d = designs.find((x) => x.id === run.designId)
    if (!d) return close()
    const ids = run.items.filter((it) => it.state !== 'done').map((it) => it.photoId)
    go(d, ids, { label: run.label, retry: true })
  }

  // Clean up / restyle / relight only the chosen photos, as their own design.
  const restylePhotos = async ({ mode: m, style: s, light: l, note: n }) => {
    const ids = (prPhotos || []).map((p) => p.id)
    if (!ids.length) return
    setPrBusy(true)
    setError('')
    try {
      const d = await withRetry(() => post('/api/properties', { op: 'design.create', propertyId: id, photoIds: ids, mode: m, style: s, light: l, note: n, lang }))
      const next = normalizeProperty(d.property)
      setProperty(next)
      setSides({ left: 'original', right: d.design.id })
      setSelected(ids[0])
      setPrPhotos(null)
      track('photo_restyle_start', { mode: m, style: s, light: l, photos: ids.length }, { propertyId: id })
      go(d.design, ids, { label: designLabel(d.design, next.designs.length - 1, t) })
    } catch (e) {
      setError(e.message || t('err.generic'))
      if (e.code === 'plan_limit') setPrPhotos(null)
    } finally {
      setPrBusy(false)
    }
  }

  const op = async (body, event) => {
    setError('')
    try {
      const d = await withRetry(() => post('/api/properties', { ...body, propertyId: id, lang }))
      setProperty(normalizeProperty(d.property))
      if (event) track(event, body, { propertyId: id })
      return d
    } catch (e) {
      setError(e.message || t('err.generic'))
      return null
    }
  }

  const deleteDesign = async (d) => {
    if (!window.confirm(t('design.deleteConfirm', { name: designName(d, t) }))) return
    await op({ op: 'design.delete', designId: d.id }, 'design_delete')
  }

  // One photo of the right-hand design: render it again, or apply a change request.
  const photoAction = async (ph, kind) => {
    if (!right) return
    setBusy((b) => ({ ...b, [ph.id]: kind }))
    setError('')
    const body = { propertyId: id, designId: right.id, photoId: ph.id, lang }
    if (kind === 'feedback') Object.assign(body, { feedback: feedback.trim(), baseVersionId: right.picks[ph.id] })
    try {
      const d = await withRetry(() => post('/api/render', body))
      setProperty((p) => addVersion(p, ph.id, d.version))
      if (kind === 'feedback') setFeedback('')
      track(kind === 'feedback' ? 'change_request' : 'photo_redo', { designId: right.id, ms: d.version.ms }, { propertyId: id })
    } catch (e) {
      setError(e.message || t('err.generic'))
      track(kind === 'feedback' ? 'change_request_failed' : 'photo_redo_failed', { code: e.code }, { propertyId: id })
    } finally {
      setBusy((b) => {
        const n = { ...b }
        delete n[ph.id]
        return n
      })
    }
  }

  const addFiles = async (files) => {
    if (!files?.length) return
    setUploading(true)
    setError('')
    const added = []
    try {
      for (const f of files) {
        const image = await shrinkPhoto(f)
        const d = await withRetry(() => post('/api/upload', { image, propertyId: id, lang }))
        setProperty((p) => ({ ...p, photos: [...p.photos, d.photo] }))
        setSelected(d.photo.id)
        added.push(d.photo)
        track('photo_upload', null, { propertyId: id })
      }
    } catch (e) {
      setError(e.message || t('err.generic'))
    } finally {
      setUploading(false)
      // Offer to clean up or restyle just the new photos.
      if (added.length && features.render !== false && run?.status !== 'running') {
        setPrPhotos(added)
        track('photo_restyle_offer', { photos: added.length }, { propertyId: id })
      }
    }
  }

  const locate = async ({ address, placeId, unit }) => {
    setLocating(true)
    setError('')
    try {
      await post('/api/property', { address, placeId, unit, lang, propertyId: id })
      track('own_locate', null, { propertyId: id })
      setListing('idle')
      await load()
    } catch (e) {
      setError(e.message || t('err.generic'))
    } finally {
      setLocating(false)
    }
  }

  // ---------------------------------------------------------------- states
  if (status === 'signin' || status === 'forbidden' || status === 'missing' || (status === 'error' && !property)) {
    return (
      <main id="main" className="page page--center">
        <h1 className="page__title">{t(`studio.state.${status}`)}</h1>
        {status !== 'missing' && status !== 'error' && <p>{t(`studio.state.${status}Body`)}</p>}
        {status === 'error' && <p>{error}</p>}
        <p className="page__actions">
          {status === 'signin' && (
            <button type="button" className="btn btn--glow" onClick={() => requireSignIn('studio')}>
              {t('nav.signin')}
            </button>
          )}
          {(status === 'signin' || status === 'forbidden') && (
            <Link to={`/p/${id}`} className="btn btn--quiet">
              {t('studio.state.buyerView')}
            </Link>
          )}
          {(status === 'missing' || status === 'error') && (
            <Link to="/" className="btn btn--glow">
              {t('hero.find')}
            </Link>
          )}
        </p>
      </main>
    )
  }
  if (!property) {
    return (
      <main id="main" className="page page--center">
        <span className="spinner" aria-hidden="true" />
        <p>{t('studio.loading')}</p>
      </main>
    )
  }

  const listingMsg = {
    looking: t('studio.listing.looking'),
    found: t('studio.listing.found', { n: photos.filter((p) => p.source === 'zillow' || p.source === 'redfin').length, src: property.listing?.used === 'redfin' ? 'Redfin' : 'Zillow' }),
    none: t('studio.listing.none'),
    off: t('studio.listing.off'),
    error: t('studio.listing.error'),
  }[listing]
  const photoBusy = photo && busy[photo.id]
  const history = photo && right ? photo.versions.filter((v) => v.designId === right.id) : []
  const canRender = features.render !== false && status === 'ready'

  return (
    <main id="main" className="studio">
      <header className="studio__head">
        <div>
          <p className="studio__eyebrow">{t('studio.eyebrow')}</p>
          <h1 className="studio__address">{property.nickname || addressLine || t('studio.ownTitle')}</h1>
          {property.address && (
            <p className="studio__place">
              {property.address.city}, {property.address.state} {property.address.zip}
            </p>
          )}
        </div>
        <div className="studio__actions">
          {property.address && (
            <button type="button" className="btn btn--quiet btn--small" onClick={() => navigate(`/p/${id}`)}>
              {t('studio.preview')}
            </button>
          )}
          <ShareBar id={id} address={property.address?.formatted || ''} owner disabled={!property.address} onShared={() => setShared((n) => n + 1)} />
        </div>
      </header>
      {property.address && <ShareStats id={id} refreshKey={shared} />}

      {property.facts && <Facts facts={property.facts} listing={property.listing} />}

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
          <button type="button" className="banner__close" onClick={() => setError('')} aria-label={t('gate.close')}>
            ×
          </button>
        </p>
      )}

      {/* ------------------------------------------------ designs */}
      <section className="designs" aria-labelledby="designs-h">
        <div className="designs__head">
          <h2 id="designs-h">{t('design.title')}</h2>
          <p className="fine">{t('design.lede')}</p>
        </div>
        {designs.length > 0 && (
          <ul className="designs__list">
            {designs.map((d, i) => {
              const cover = visible.map((p) => sideImage(property, d.id, p)).find(Boolean)
              const have = visible.filter((p) => d.picks[p.id]).length
              const isRunning = run?.status === 'running' && run.designId === d.id
              return (
                <li key={d.id}>
                  <button type="button" className="dchip" aria-pressed={sides.right === d.id} onClick={() => setSides((s) => ({ left: s.left === d.id ? 'original' : s.left, right: d.id }))} disabled={!have}>
                    <span className="dchip__img">{cover ? <img src={cover.src} alt="" loading="lazy" /> : <span className="spinner spinner--small" aria-hidden="true" />}</span>
                    <span className="dchip__txt">
                      <span className="dchip__n">
                        {t('design.n', { n: i + 1 })}
                        {property.featured === d.id && <span className="dchip__star" title={t('design.featured')}>★</span>}
                      </span>
                      <span className="dchip__name">{designName(d, t)}</span>
                      <span className="dchip__meta">{isRunning ? t('design.running') : d.scope && have <= d.scope.length && have < visible.length ? t(have === 1 ? 'design.scoped1' : 'design.scoped', { n: have }) : have < visible.length ? t('design.partial', { have, total: visible.length }) : t(have === 1 ? 'design.scoped1' : 'design.photos', { n: have })}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {right && (
          <div className="designs__actions">
            {property.featured === right.id ? (
              <span className="tag">★ {t('design.featured')}</span>
            ) : (
              <button type="button" className="btn btn--quiet btn--small" onClick={() => op({ op: 'design.feature', designId: right.id }, 'design_feature')}>
                {t('design.feature')}
              </button>
            )}
            {missing.length > 0 && !(run?.status === 'running') && (
              <button type="button" className="btn btn--quiet btn--small" onClick={() => finishDesign(right)} disabled={!canRender}>
                {right.scope ? t('design.extend', { n: missing.length }) : t('design.finish', { n: missing.length })}
              </button>
            )}
            <button type="button" className="btn btn--quiet btn--small btn--danger" onClick={() => deleteDesign(right)} disabled={run?.status === 'running'}>
              {t('design.delete')}
            </button>
          </div>
        )}

        <div className="newdesign">
          <h3>{designs.length ? t('design.new') : t('design.first')}</h3>
          <div className="seg seg--wide" role="group" aria-label={t('studio.mode.label')}>
            <button type="button" aria-pressed={mode === 'redesign'} onClick={() => setMode('redesign')}>
              {t('studio.mode.redesign')}
            </button>
            <button type="button" aria-pressed={mode === 'cleanup'} onClick={() => setMode('cleanup')}>
              {t('studio.mode.cleanup')}
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
          {mode === 'redesign' && (
            <label className="field field--note">
              <span>{t('design.note')}</span>
              <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('design.notePh')} maxLength={300} />
            </label>
          )}
          <div className="newdesign__go">
            <button type="button" className="btn btn--glow btn--big" onClick={restyleHouse} disabled={!canRender || starting || !visible.length || run?.status === 'running'}>
              {starting ? t('design.starting') : mode === 'polish' ? t('studio.renderPolish', { n: visible.length }) : mode === 'cleanup' ? t('studio.renderPro', { n: visible.length }) : t('studio.render', { n: visible.length })}
            </button>
            <p className="fine">{t('studio.renderNote', { min: Math.max(1, Math.round((Math.ceil(visible.length / 3) * 30) / 60)) })}</p>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ photos */}
      <div className="workspace">
        <section className="viewer" aria-label={t('studio.photos')}>
          {photo ? (
            <>
              <SidePicker designs={designs} left={sides.left} right={sides.right} onChange={(s) => (setSides(s), track('design_compare', s, { propertyId: id }))} />
              <div className="viewer__frame">
                <Compare
                  key={`${photo.id}-${leftImg?.src}-${rightImg?.src}`}
                  before={leftImg?.src || photo.src}
                  after={rightImg?.src}
                  width={photo.width}
                  height={photo.height}
                  beforeLabel={shortSideLabel(property, sides.left, t)}
                  afterLabel={sides.right ? shortSideLabel(property, sides.right, t) : ''}
                  alt={property.address?.formatted || ''}
                />
                {photoBusy && (
                  <div className="viewer__busy" role="status">
                    <span className="spinner" aria-hidden="true" /> {photoBusy === 'feedback' ? t('studio.applying') : t('studio.rendering')}
                  </div>
                )}
              </div>
              <p className="viewer__credit">
                {creditText(photo, t)}
                {right && !rightImg && !photoBusy && <span className="viewer__hint"> — {t('studio.notInDesign')}</span>}
                {!designs.length && <span className="viewer__hint"> — {t('studio.noVersion')}</span>}
              </p>

              {!right && (
                <div className="phototools__row phototools__row--solo">
                  <button type="button" className="btn btn--ink btn--small" onClick={() => setPrPhotos([photo])} disabled={!canRender || photo.hidden || run?.status === 'running'}>
                    {t('pr.open')}
                  </button>
                  <button type="button" className="btn btn--quiet btn--small" onClick={() => op({ op: 'photo.hide', photoId: photo.id, hidden: !photo.hidden }, photo.hidden ? 'photo_show' : 'photo_hide')}>
                    {photo.hidden ? t('studio.unhide') : t('studio.hide')}
                  </button>
                  {photo.source === 'owner' && (
                    <button type="button" className="btn btn--quiet btn--small btn--danger" onClick={() => window.confirm(t('studio.removeConfirm')) && op({ op: 'photo.delete', photoId: photo.id }, 'photo_delete')}>
                      {t('studio.remove')}
                    </button>
                  )}
                </div>
              )}
              {right && (
                <div className="phototools">
                  {rightImg && (
                    <form
                      className="feedback"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (feedback.trim()) photoAction(photo, 'feedback')
                      }}
                    >
                      <label htmlFor="fb" className="feedback__label">
                        {t('studio.feedback', { name: designName(right, t) })}
                      </label>
                      <div className="feedback__row">
                        <input id="fb" type="text" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder={t('studio.feedbackPh')} maxLength={600} />
                        <button type="submit" className="btn btn--ink" disabled={!!photoBusy || !feedback.trim() || !canRender}>
                          {photoBusy === 'feedback' ? t('studio.applying') : t('studio.apply')}
                        </button>
                      </div>
                      <p className="fine">{t('studio.feedbackNote')}</p>
                    </form>
                  )}
                  <div className="phototools__row">
                    <button type="button" className="btn btn--quiet btn--small" onClick={() => setPrPhotos([photo])} disabled={!canRender || photo.hidden || run?.status === 'running'}>
                      {t('pr.open')}
                    </button>
                    <button type="button" className="btn btn--quiet btn--small" onClick={() => photoAction(photo, 'redo')} disabled={!!photoBusy || !canRender || photo.hidden}>
                      {rightImg ? t('studio.redo') : t('studio.addToDesign')}
                    </button>
                    {rightImg && (
                      <a className="btn btn--quiet btn--small" href={rightImg.src} download={`sceneshare-${id}-${photo.id}.jpg`} target="_blank" rel="noreferrer" onClick={() => track('download', null, { propertyId: id })}>
                        {t('studio.download')}
                      </a>
                    )}
                    <button type="button" className="btn btn--quiet btn--small" onClick={() => op({ op: 'photo.hide', photoId: photo.id, hidden: !photo.hidden }, photo.hidden ? 'photo_show' : 'photo_hide')}>
                      {photo.hidden ? t('studio.unhide') : t('studio.hide')}
                    </button>
                    {photo.source === 'owner' && (
                      <button
                        type="button"
                        className="btn btn--quiet btn--small btn--danger"
                        onClick={() => window.confirm(t('studio.removeConfirm')) && op({ op: 'photo.delete', photoId: photo.id }, 'photo_delete')}
                      >
                        {t('studio.remove')}
                      </button>
                    )}
                  </div>
                  {history.length > 1 && (
                    <div className="versions">
                      <h3>{t('studio.versions')}</h3>
                      <ul>
                        {history.map((v, i) => (
                          <li key={v.id}>
                            <button
                              type="button"
                              className="versions__thumb"
                              aria-pressed={right.picks[photo.id] === v.id}
                              onClick={() => op({ op: 'version.pick', designId: right.id, photoId: photo.id, versionId: v.id }, 'version_pick')}
                              title={v.feedback || t('studio.versionN', { n: i + 1 })}
                            >
                              <img src={v.src} alt={t('studio.versionN', { n: i + 1 })} width={v.width} height={v.height} loading="lazy" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <p className="fine">{t('studio.versionsNote')}</p>
                    </div>
                  )}
                </div>
              )}
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
            <span className="rail__count">
              {visible.length}
              {photos.length !== visible.length ? ` / ${photos.length}` : ''}
            </span>
          </div>
          {listingMsg && (
            <p className={`rail__status rail__status--${listing}`} role="status">
              {listing === 'looking' && <span className="spinner spinner--small" aria-hidden="true" />} {listingMsg}
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
              <span className="spinner spinner--small" aria-hidden="true" /> {t('studio.uploading')}
            </p>
          )}
          <ul className="thumbs">
            {photos.map((p) => {
              const img = (sides.right && sideImage(property, sides.right, p)) || p
              return (
                <li key={p.id} className={p.hidden ? 'is-hidden' : ''}>
                  <button type="button" aria-pressed={p.id === selected} onClick={() => setSelected(p.id)} aria-label={`${t('studio.photo')} ${photos.indexOf(p) + 1}${p.hidden ? ` (${t('studio.hidden')})` : ''}`}>
                    <img src={img.src} alt="" loading="lazy" width={p.width || undefined} height={p.height || undefined} />
                    {busy[p.id] && <span className="thumbs__busy spinner spinner--small" aria-hidden="true" />}
                    {right?.picks[p.id] && <span className="thumbs__done" aria-hidden="true" />}
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

      {run && <HouseProgress run={run} photos={photos} onStop={stop} onRetry={retryRun} onClose={close} />}
      {prPhotos && <PhotoRestyle photos={prPhotos} styles={STYLES} lights={LIGHTS} busy={prBusy} onStart={restylePhotos} onClose={() => (setPrPhotos(null), track('photo_restyle_dismiss', null, { propertyId: id }))} />}
    </main>
  )
}

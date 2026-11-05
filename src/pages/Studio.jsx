import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addVersion, normalizeProperty, visiblePhotos } from '../../shared/model.js'
import AddressSearch from '../components/AddressSearch.jsx'
import Compare from '../components/Compare.jsx'
import Facts from '../components/Facts.jsx'
import Review from '../components/Review.jsx'
import HouseProgress from '../components/HouseProgress.jsx'
import PhotoRestyle from '../components/PhotoRestyle.jsx'
import PropertyMap from '../components/PropertyMap.jsx'
import ShareBar from '../components/ShareBar.jsx'
import ShareStats from '../components/ShareStats.jsx'
import SidePicker from '../components/SidePicker.jsx'
import { creditText, useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { get, health, post, recalledProperty, retriable, shrinkPhoto, sleep } from '../lib/api.js'
import { ensureTerms, requireSignIn, useAuth } from '../lib/auth.js'
import { defaultSides, designLabel, designName, sideImage, shortSideLabel } from '../lib/designs.js'
import { lotSqft } from '../lib/format.js'
import { useBilling } from '../lib/billing.js'
import { useHouseRun } from '../lib/houseRun.js'
import { Link, useRouter } from '../router.jsx'

const SOURCE_NAMES = { zillow: 'Zillow', redfin: 'Redfin', homes: 'Homes.com' }

export const STYLES = ['signature', 'coastal-modern', 'pure-form', 'resort-living', 'timeless-estate', 'urban-penthouse', 'executive-modern', 'avant-garde']
export const LIGHTS = ['daylight', 'golden', 'twilight', 'original']
const ORDER = { zillow: 0, redfin: 0, homes: 0, owner: 1, streetview: 2, google: 3 }

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

// A rail thumbnail that shimmers until its image has actually arrived.
function Thumb({ src, width, height }) {
  const [state, setState] = useState('loading')
  const ref = useRef(null)
  useEffect(() => {
    setState(ref.current?.complete && ref.current.naturalWidth ? 'ready' : 'loading')
  }, [src])
  return (
    <span className={`thumbimg thumbimg--${state}`}>
      <img ref={ref} src={src} alt="" loading="lazy" width={width || undefined} height={height || undefined} onLoad={() => setState('ready')} onError={() => setState('error')} />
    </span>
  )
}

export default function Studio({ id }) {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const { user, ready, terms } = useAuth()
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
  const [linkUrl, setLinkUrl] = useState('')
  const [linkMsg, setLinkMsg] = useState(null) // { busy } | { ok, text }
  const [reviewing, setReviewing] = useState(null) // { designId, startAt } while the review pass is open

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
        const n = d.property?.photos?.filter((p) => ['zillow', 'redfin', 'homes'].includes(p.source)).length || 0
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

  // Discarding a round deletes its images for good and takes them off the share page.
  const deleteDesign = async (d) => {
    if (!d || !window.confirm(t('design.deleteConfirm', { name: designName(d, t) }))) return false
    const out = await op({ op: 'design.delete', designId: d.id }, 'design_delete')
    if (out) {
      if (reviewing?.designId === d.id) setReviewing(null)
      if (run?.designId === d.id && run.status !== 'running') close()
    }
    return !!out
  }

  // The review pass: a "looks good" or a note per image, saved to the home.
  const saveReview = useCallback(
    async (photoId, { status, note }) => {
      try {
        const d = await post('/api/properties', { op: 'design.review', propertyId: id, designId: reviewing?.designId, photoId, status, note, lang })
        setProperty(normalizeProperty(d.property))
        return true
      } catch {
        return false
      }
    },
    [id, lang, reviewing?.designId],
  )
  // One noted image: apply the note as a change request on its current version.
  const applyNote = useCallback(
    async (ph, note) => {
      const d = designs.find((x) => x.id === reviewing?.designId)
      if (!d) return false
      setBusy((b) => ({ ...b, [ph.id]: 'feedback' }))
      try {
        const r = await withRetry(() => post('/api/render', { propertyId: id, designId: d.id, photoId: ph.id, lang, feedback: note, baseVersionId: d.picks[ph.id], review: true }))
        setProperty((p) => {
          const next = addVersion(p, ph.id, r.version)
          return r.design ? { ...next, designs: next.designs.map((x) => (x.id === r.design.id ? { ...x, review: r.design.review } : x)) } : next
        })
        track('change_request', { designId: d.id, ms: r.version.ms, from: 'review' }, { propertyId: id })
        return true
      } catch (e) {
        track('change_request_failed', { code: e.code, from: 'review' }, { propertyId: id })
        return e.code === 'no_credits' || e.code === 'plan_limit' ? 'stop' : false
      } finally {
        setBusy((b) => {
          const n = { ...b }
          delete n[ph.id]
          return n
        })
      }
    },
    [designs, id, lang, reviewing?.designId],
  )
  const openReview = (d, startAt = null) => {
    if (!d) return
    setSides({ left: 'original', right: d.id })
    setReviewing({ designId: d.id, startAt })
    track('review_open', { photos: Object.keys(d.picks).length }, { propertyId: id })
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

  // A pasted Zillow / Redfin / Homes.com link: import exactly that listing's photos.
  const importLink = async (e) => {
    e.preventDefault()
    const url = linkUrl.trim()
    if (!url) return
    setLinkMsg({ busy: true })
    setError('')
    try {
      const d = await post('/api/listing', { propertyId: id, url, lang })
      if (d.property) setProperty(normalizeProperty(d.property))
      const n = d.property?.photos?.filter((p) => ['zillow', 'redfin', 'homes'].includes(p.source)).length || 0
      setLinkMsg(d.found ? { ok: true, text: t('link.done', { n, src: SOURCE_NAMES[d.listing?.used] || '' }) } : { ok: false, text: t('link.none') })
      if (d.found) {
        setLinkUrl('')
        setListing('found')
      }
      track('listing_link', { found: d.found, source: d.listing?.used || d.link || null, photos: n }, { propertyId: id })
    } catch (err) {
      setLinkMsg({ ok: false, text: err.message || t('err.generic') })
      track('listing_link_failed', { code: err.code }, { propertyId: id })
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
    found: t('studio.listing.found', { n: photos.filter((p) => ['zillow', 'redfin', 'homes'].includes(p.source)).length, src: SOURCE_NAMES[property.listing?.used] || 'Zillow' }),
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
      {property.address && !terms?.accepted && (
        <p className="banner banner--warn">
          {t('terms.hiddenOwner')}{' '}
          <button type="button" className="linkbtn" onClick={() => ensureTerms('studio')}>
            {t('terms.review')}
          </button>
        </p>
      )}
      {property.address && <ShareStats id={id} refreshKey={shared} photos={photos} />}

      {property.facts && <Facts facts={property.facts} listing={property.listing} />}

      {error && (
        <p className="banner banner--error" role="alert">
          {error}
          <button type="button" className="banner__close" onClick={() => setError('')} aria-label={t('gate.close')}>
            ×
          </button>
        </p>
      )}

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
            listing === 'looking' || status === 'loading' ? (
              <div className="viewer__empty viewer__empty--loading" role="status" aria-live="polite">
                <span className="skeleton skeleton--frame" aria-hidden="true" />
                <p>
                  <span className="spinner spinner--small" aria-hidden="true" /> {t('studio.listing.looking')}
                </p>
              </div>
            ) : (
              <div className="viewer__empty">
                <p>{t('studio.empty')}</p>
              </div>
            )
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
          {property.address && listing !== 'looking' && (
            <form className="linkimport" onSubmit={importLink}>
              <label htmlFor="linkimport">{t('link.label')}</label>
              <div className="linkimport__row">
                <input id="linkimport" type="url" inputMode="url" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder={t('link.ph')} disabled={linkMsg?.busy} />
                <button type="submit" className="btn btn--quiet btn--small" disabled={!linkUrl.trim() || linkMsg?.busy}>
                  {linkMsg?.busy ? <span className="spinner spinner--small" aria-hidden="true" /> : null} {linkMsg?.busy ? t('link.busy') : t('link.go')}
                </button>
              </div>
              {linkMsg?.text && (
                <p className={`linkimport__msg ${linkMsg.ok ? '' : 'is-bad'}`} role="status">
                  {linkMsg.text}
                </p>
              )}
            </form>
          )}
          <ul className="thumbs">
            {photos.map((p) => {
              const img = (sides.right && sideImage(property, sides.right, p)) || p
              return (
                <li key={p.id} className={p.hidden ? 'is-hidden' : ''}>
                  <button type="button" aria-pressed={p.id === selected} onClick={() => setSelected(p.id)} aria-label={`${t('studio.photo')} ${photos.indexOf(p) + 1}${p.hidden ? ` (${t('studio.hidden')})` : ''}`}>
                    <Thumb src={img.src} width={p.width} height={p.height} />
                    {busy[p.id] && <span className="thumbs__busy spinner spinner--small" aria-hidden="true" />}
                    {right?.picks[p.id] && <span className="thumbs__done" aria-hidden="true" />}
                    {right?.review?.[p.id]?.status === 'change' && right.review[p.id].note && <span className="thumbs__note" aria-hidden="true" title={right.review[p.id].note} />}
                  </button>
                </li>
              )
            })}
            {listing === 'looking' &&
              Array.from({ length: photos.length ? 3 : 6 }, (_, i) => (
                <li key={`sk${i}`} aria-hidden="true">
                  <span className="skeleton skeleton--thumb" />
                </li>
              ))}
          </ul>
        </aside>
      </div>

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
            {Object.keys(right.picks).length > 0 && (
              <button type="button" className="btn btn--ink btn--small" onClick={() => openReview(right, selected)} disabled={run?.status === 'running'}>
                {(() => {
                  const notes = Object.values(right.review || {}).filter((r) => r.status === 'change' && r.note).length
                  return notes ? t(notes === 1 ? 'review.openNotes1' : 'review.openNotes', { n: notes }) : t('review.openShort')
                })()}
              </button>
            )}
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
              {t('design.discard')}
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
            <RunCost need={visible.length} />
          </div>
        </div>
      </section>

      {property.address ? (
        <PropertyMap address={property.address} parcel={property.parcel} pois={property.pois} lotSqft={lotSqft(property.facts)} />
      ) : (
        <section className="location location--ask">
          <h2>{t('map.title')}</h2>
          <p>{t('studio.ownAddress')}</p>
          <AddressSearch onFind={locate} busy={locating} />
        </section>
      )}

      {run && (
        <HouseProgress
          run={run}
          photos={photos}
          onStop={stop}
          onRetry={retryRun}
          onClose={close}
          onReview={() => {
            const d = designs.find((x) => x.id === run.designId)
            close()
            openReview(d)
          }}
          onDiscard={() => deleteDesign(designs.find((x) => x.id === run.designId))}
        />
      )}
      {reviewing && designs.some((d) => d.id === reviewing.designId) && (
        <Review
          property={property}
          design={designs.find((d) => d.id === reviewing.designId)}
          photos={visible}
          name={designName(designs.find((d) => d.id === reviewing.designId), t)}
          startAt={reviewing.startAt}
          onSave={saveReview}
          onApply={applyNote}
          onDiscard={() => deleteDesign(designs.find((d) => d.id === reviewing.designId))}
          onClose={() => setReviewing(null)}
        />
      )}
      {prPhotos && <PhotoRestyle photos={prPhotos} styles={STYLES} lights={LIGHTS} busy={prBusy} onStart={restylePhotos} onClose={() => (setPrPhotos(null), track('photo_restyle_dismiss', null, { propertyId: id }))} />}
    </main>
  )
}

// "Uses 15 credits · 268 left", or a warning when the run would stop part-way.
function RunCost({ need }) {
  const { t } = useI18n()
  const { billing: b } = useBilling()
  const c = b?.credits
  if (!c || !need || b.mode === 'off') return null
  if (c.unlimited) return <p className="runcost">{t('credits.run', { n: need })}</p>
  const short = c.available < need
  return (
    <p className={`runcost ${short ? 'runcost--short' : ''}`}>
      {short ? t('credits.runShort', { n: need, left: c.available }) : t('credits.runLeft', { n: need, left: c.available - need })}{' '}
      {short && (
        <Link to="/plan#credits">{t('credits.buyMore')}</Link>
      )}
    </p>
  )
}

import { useState } from 'react'
import { compass, useI18n } from '../i18n.js'
import { lotSqft, num } from '../lib/format.js'
import { groupOf } from './PropertyMap.jsx'

const TYPES = { SINGLE_FAMILY: 'single', CONDO: 'condo', TOWNHOUSE: 'townhouse', MULTI_FAMILY: 'multi', APARTMENT: 'apartment', MANUFACTURED: 'manufactured', LOT: 'land' }
const STATUS = { FOR_SALE: 'forSale', PENDING: 'pending', RECENTLY_SOLD: 'sold', SOLD: 'sold', OFF_MARKET: 'offMarket', FOR_RENT: 'forRent', COMING_SOON: 'comingSoon' }
const miles = (m) => (m / 1609.34 < 10 ? (m / 1609.34).toFixed(1) : Math.round(m / 1609.34))

// "About this home": everything we know about the property, above the map —
// the facts, price per square foot, the parcel, the listing's own description and
// a one-line summary of what's nearby. Only facts we actually have are shown.
export default function PropertyDetails({ property }) {
  const { t, lang } = useI18n()
  const [more, setMore] = useState(false)
  const f = property.facts || {}
  const a = property.address || {}
  const pc = property.parcel
  const money = (n) => new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  const lot = lotSqft(f)
  const ppsf = f.price && f.livingArea ? Math.round(f.price / f.livingArea) : null
  const rows = [
    ['details.type', f.homeType ? t(`details.t.${TYPES[f.homeType] || 'other'}`) : null],
    ['details.status', f.status ? t(`details.s.${STATUS[f.status] || 'other'}`) : null],
    ['details.price', f.price ? money(f.price) : null],
    ['details.ppsf', ppsf ? `${money(ppsf)} / ${t('facts.sqftUnit')}` : null],
    ['facts.beds', num(f.beds, lang)],
    ['facts.baths', num(f.baths, lang)],
    ['facts.sqft', f.livingArea ? `${num(f.livingArea, lang)} ${t('facts.sqftUnit')}` : null],
    ['facts.lot', lot ? `${num(Math.round(lot), lang)} ${t('facts.sqftUnit')}${lot >= 21780 ? ` (${(lot / 43560).toFixed(2)} ${t('facts.acres')})` : ''}` : null],
    ['facts.built', f.yearBuilt ? `${f.yearBuilt} · ${t('details.age', { n: new Date().getFullYear() - f.yearBuilt })}` : null],
    ['details.apn', pc?.apn ? `${pc.apn}${pc.county ? ` · ${pc.county}` : ''}` : null],
    ['details.unit', a.unit ? `#${a.unit}` : null],
    ['details.location', a.city ? `${a.city}, ${a.state} ${a.zip || ''}`.trim() : null],
  ].filter(([, v]) => v)

  const pois = property.pois || []
  const nearest = (cats) => pois.filter((p) => cats.includes(p.category)).sort((x, y) => x.meters - y.meters)[0]
  const glance = [
    ['schools', nearest(['elementary', 'school', 'middle', 'high'])],
    ['outdoors', nearest(['park', 'beach'])],
    ['everyday', nearest(['grocery'])],
    ['travel', nearest(['airport'])],
  ].filter(([, p]) => p)

  const desc = (f.description || '').trim()
  if (!rows.length && !desc && !glance.length) return null
  const long = desc.length > 420

  return (
    <section className="details" aria-labelledby="details-h" data-section="details">
      <h2 id="details-h">{t('details.title')}</h2>
      <div className="details__grid">
        {rows.length > 0 && (
          <dl className="details__facts">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{t(k)}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        <div className="details__side">
          {desc && (
            <div className="details__desc">
              <h3>{t('details.fromListing')}</h3>
              <p>{long && !more ? `${desc.slice(0, 420).replace(/\s+\S*$/, '')}…` : desc}</p>
              {long && (
                <button type="button" className="linkbtn" onClick={() => setMore((m) => !m)}>
                  {more ? t('details.less') : t('details.more')}
                </button>
              )}
              {property.listing?.zillow && (
                <p className="fine">
                  <a href={property.listing.zillow} target="_blank" rel="noreferrer">
                    {t('facts.source', { src: 'Zillow' })}
                  </a>
                </p>
              )}
            </div>
          )}
          {glance.length > 0 && (
            <div className="details__glance">
              <h3>{t('details.around')}</h3>
              <ul>
                {glance.map(([g, p]) => (
                  <li key={g}>
                    <span className={`details__g pin--g-${groupOf(p)}`} aria-hidden="true" />
                    <span>
                      <strong>{t(`poi.${p.category}`)}</strong> · {p.name}
                    </span>
                    <span className="details__d">
                      {miles(p.meters)} {t('unit.mi')} {t(`dir.${compass(p.bearing)}`)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      <p className="fine">{t('details.note')}</p>
    </section>
  )
}

import { useI18n } from '../i18n.js'
import { num } from '../lib/format.js'

// Facts as a single ledger line: label over value, only the ones we actually have.
export default function Facts({ facts, listing }) {
  const { t, lang } = useI18n()
  const lot = facts.lotArea
    ? String(facts.lotAreaUnit || '').toLowerCase().startsWith('acre')
      ? `${num(facts.lotArea, lang)} ${t('facts.acres')}`
      : `${num(facts.lotArea, lang)} ${t('facts.sqftUnit')}`
    : null
  const rows = [
    ['facts.beds', num(facts.beds, lang)],
    ['facts.baths', num(facts.baths, lang)],
    ['facts.sqft', facts.livingArea ? `${num(facts.livingArea, lang)} ${t('facts.sqftUnit')}` : null],
    ['facts.lot', lot],
    ['facts.built', facts.yearBuilt ? String(facts.yearBuilt) : null],
  ].filter(([, v]) => v)
  if (!rows.length) return null
  const src = listing?.zillow ? 'Zillow' : null
  return (
    <div className="facts">
      <dl>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{t(k)}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {src && (
        <p className="facts__src">
          <a href={listing.zillow} target="_blank" rel="noreferrer">
            {t('facts.source', { src })}
          </a>
        </p>
      )}
    </div>
  )
}

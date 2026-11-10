import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { get } from '../lib/api.js'

const when = (s, lang) => new Date(s).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// For the owner: how often the home was shared and how often each share was opened.
const dur = (ms, t) => {
  const sec = Math.round(ms / 1000)
  if (sec < 60) return t('stats.sec', { n: sec })
  const m = Math.floor(sec / 60)
  const r = sec % 60
  return r ? t('stats.minSec', { m, s: r }) : t('stats.min', { n: m })
}

// Where buyers spend their time on the share page: average visit, the section that
// holds them longest and, when the photos are known, the rooms they linger on.
function Engagement({ e, photos }) {
  const { t } = useI18n()
  if (!e?.visits) return null
  const total = e.sections.reduce((a, x) => a + x.ms, 0) || 1
  const top = e.sections[0]
  const index = new Map((photos || []).map((p, i) => [p.id, i]))
  const rooms = (e.rooms || []).filter((r) => index.has(r.photoId)).slice(0, 4)
  return (
    <div className="engage">
      <p className="engage__lead">
        <span>
          <strong>{dur(e.avgMs, t)}</strong> {t(e.visits === 1 ? 'stats.avgVisit1' : 'stats.avgVisit', { n: e.visits })}
        </span>
        {top && (
          <span>
            {t('stats.topSection')} <strong>{t(`section.${top.section}`)}</strong>
          </span>
        )}
      </p>
      <ul className="engage__bars" aria-label={t('stats.timeBySection')}>
        {e.sections.slice(0, 6).map((x) => (
          <li key={x.section}>
            <span className="engage__k">{t(`section.${x.section}`)}</span>
            <span className="engage__bar" aria-hidden="true">
              <span style={{ width: `${Math.max(2, (x.ms / total) * 100)}%` }} />
            </span>
            <span className="engage__v">{Math.round((x.ms / total) * 100)}%</span>
          </li>
        ))}
      </ul>
      {rooms.length > 0 && (
        <p className="fine">
          {t('stats.topRooms')}{' '}
          {rooms.map((r, i) => (
            <span key={r.photoId}>
              {i ? ' · ' : ''}
              {t('stats.photoN', { n: index.get(r.photoId) + 1 })} ({dur(r.ms, t)})
            </span>
          ))}
        </p>
      )}
    </div>
  )
}

export default function ShareStats({ id, refreshKey = 0, photos = null }) {
  const { t, lang } = useI18n()
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(false)
  const load = useCallback(() => get(`/api/shares?propertyId=${id}`).then(setData).catch(() => {}), [id])
  useEffect(() => {
    const timer = setTimeout(load, refreshKey ? 800 : 0)
    return () => clearTimeout(timer)
  }, [load, refreshKey])
  if (!data?.totals) return null
  const T = data.totals
  if (!T.shares && !T.recipients && !T.opens && !T.views) return null
  return (
    <section className="sharestats" aria-label={t('stats.title')}>
      <button type="button" className="sharestats__sum" aria-expanded={open} onClick={() => setOpen((o) => !o)} disabled={!data.shares.length}>
        <span>
          <strong>{T.shares}</strong> {t('stats.shares')}
        </span>
        <span>
          <strong>{T.recipients}</strong> {t('stats.emailed')}
        </span>
        <span>
          <strong>{T.opens}</strong> {t('stats.opens')}
        </span>
        <span>
          <strong>{T.views}</strong> {t('stats.views')}
        </span>
        {data.shares.length > 0 && <span className="sharestats__more">{open ? t('stats.hide') : t('stats.show')}</span>}
      </button>
      <Engagement e={data.engagement} photos={photos} />
      {open && (
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('stats.when')}</th>
                <th scope="col">{t('stats.how')}</th>
                <th scope="col">{t('stats.to')}</th>
                <th scope="col">{t('stats.opened')}</th>
              </tr>
            </thead>
            <tbody>
              {data.shares.map((s) => (
                <tr key={s.id}>
                  <td>{when(s.created_at, lang)}</td>
                  <td>
                    {t(`stats.ch.${s.channel}`)}
                    {!s.by_owner && <span className="fine"> · {t('stats.byBuyer')}</span>}
                  </td>
                  <td>{s.recipients?.length ? s.recipients.join(', ') : '—'}</td>
                  <td>{s.tracked === false ? t('stats.untracked') : s.opens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

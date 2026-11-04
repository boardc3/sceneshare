import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n.js'
import { get } from '../lib/api.js'

const when = (s, lang) => new Date(s).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// For the owner: how often the home was shared and how often each share was opened.
export default function ShareStats({ id, refreshKey = 0 }) {
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

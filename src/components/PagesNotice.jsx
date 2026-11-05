import { useI18n } from '../i18n.js'
import { useBilling } from '../lib/billing.js'
import { Link } from '../router.jsx'

// For an owner whose plan has ended: share pages stay online for 14 days, then go
// offline for buyers until a plan is chosen (the links stay the same).
export default function PagesNotice() {
  const { t, lang } = useI18n()
  const { billing: b } = useBilling()
  const p = b?.pages
  if (!b || b.mode === 'off' || b.plan !== 'none' || !p?.until) return null
  const date = new Date(p.until).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'long', day: 'numeric' })
  return (
    <div className={`pagesnotice ${p.live ? '' : 'is-off'}`} role="status">
      <p>{p.live ? t('pages.until', { date }) : t('pages.offline')}</p>
      <Link to="/plan" className="btn btn--glow btn--small">
        {p.live ? t('pages.keep') : t('pages.back')}
      </Link>
    </div>
  )
}

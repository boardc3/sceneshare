import { Component, lazy, Suspense, useEffect, useMemo, useState } from 'react'
import ApiErrors from './components/ApiErrors.jsx'
import PagesNotice from './components/PagesNotice.jsx'
import { AuthModal, CookieBanner, Footer, Nav, TermsPrompt, UpgradePrompt } from './components/Chrome.jsx'
import { I18n, translate, useI18n } from './i18n.js'
import { initAnalytics, pageView, reportError } from './lib/analytics.js'
import { refresh, savePrefs, useAuth } from './lib/auth.js'
import Landing from './pages/Landing.jsx'
import Own from './pages/Own.jsx'
import Share from './pages/Share.jsx'
import Studio from './pages/Studio.jsx'
import { Link, Router, match, useRouter } from './router.jsx'

// Pages most visitors never open load on demand.
const Account = lazy(() => import('./pages/Account.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const Insights = lazy(() => import('./pages/Insights.jsx'))
const Legal = lazy(() => import('./pages/Legal.jsx'))
const Plan = lazy(() => import('./pages/Plan.jsx'))
const PrivacyRequest = lazy(() => import('./pages/PrivacyRequest.jsx'))
const Reset = lazy(() => import('./pages/Reset.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

function initialLang() {
  const q = new URLSearchParams(window.location.search).get('lang')
  if (q === 'zh' || q === 'en') return q
  try {
    const saved = localStorage.getItem('ss:lang')
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    /* ignore */
  }
  return (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
}

// Chinese faces load only when Chinese is chosen — they are large.
function loadCjkFonts() {
  if (document.getElementById('cjk-fonts')) return
  const l = document.createElement('link')
  l.id = 'cjk-fonts'
  l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@500;700&display=swap'
  document.head.appendChild(l)
}

// A crash in one page shows a calm message (and is reported), never a white screen.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    reportError(error, { source: 'react', component: String(info?.componentStack || '').slice(0, 800) })
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (!this.state.error) return this.props.children
    return <Crash />
  }
}

function Crash() {
  const { t } = useI18n()
  return (
    <main id="main" className="page page--center">
      <h1 className="page__title">{t('crash.title')}</h1>
      <p>{t('crash.body')}</p>
      <p className="page__actions">
        <button type="button" className="btn btn--glow" onClick={() => window.location.reload()}>
          {t('crash.reload')}
        </button>
        <a className="btn btn--quiet" href="/">
          {t('crash.home')}
        </a>
      </p>
    </main>
  )
}

function NotFound() {
  const { t } = useI18n()
  useEffect(() => {
    document.title = `${t('notfound.title')} — Sceneshare`
  }, [t])
  return (
    <main id="main" className="page page--center">
      <p className="page__eyebrow">404</p>
      <h1 className="page__title">{t('notfound.title')}</h1>
      <p>{t('notfound.body')}</p>
      <p className="page__actions">
        <Link to="/" className="btn btn--glow">
          {t('notfound.home')}
        </Link>
      </p>
    </main>
  )
}

const Loading = () => (
  <main id="main" className="page page--center">
    <span className="spinner" aria-hidden="true" />
  </main>
)

function Pages() {
  const { path } = useRouter()
  const { t, lang, setLang } = useI18n()
  const { user, prefs } = useAuth()
  // A signed-in account's language follows it to every device.
  useEffect(() => {
    if (user && prefs?.lang && prefs.lang !== lang) setLang(prefs.lang, { local: true })
  }, [user?.id, prefs?.lang]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = match(path)
  useEffect(() => {
    if (!['share', 'studio'].includes(m.page)) document.title = m.page === 'home' ? t('meta.title') : `${t(`meta.${m.page === 'legal' ? m.doc : m.page}`)} — Sceneshare`
    const id = setTimeout(() => pageView(path), 50) // after the page sets its own title
    return () => clearTimeout(id)
  }, [path]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <a href="#main" className="skip">
        {t('skip')}
      </a>
      <Nav tone={m.page === 'home' ? 'dark' : 'light'} />
      <ErrorBoundary resetKey={path}>
        {['studio', 'account', 'insights', 'own'].includes(m.page) && <PagesNotice />}
        <Suspense fallback={<Loading />}>
          {m.page === 'home' && <Landing />}
          {m.page === 'own' && <Own />}
          {m.page === 'studio' && <Studio key={m.id} id={m.id} />}
          {m.page === 'share' && <Share key={m.id} id={m.id} />}
          {m.page === 'account' && <Account />}
          {m.page === 'admin' && <Admin />}
          {m.page === 'insights' && <Insights />}
          {m.page === 'reset' && <Reset />}
          {m.page === 'settings' && <Settings />}
          {m.page === 'plan' && <Plan />}
          {m.page === 'legal' && <Legal key={m.doc} doc={m.doc} />}
          {m.page === 'privacyRequest' && <PrivacyRequest />}
          {m.page === 'notfound' && <NotFound />}
        </Suspense>
      </ErrorBoundary>
      <Footer />
      <AuthModal />
      <UpgradePrompt />
      <TermsPrompt />
      <CookieBanner />
      <ApiErrors />
    </>
  )
}

export default function App() {
  const [lang, setLangState] = useState(initialLang)
  useEffect(() => {
    initAnalytics()
    refresh()
  }, [])
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en'
    document.documentElement.dataset.lang = lang
    if (lang === 'zh') loadCjkFonts()
  }, [lang])
  const value = useMemo(
    () => ({
      lang,
      setLang: (l, { local = false } = {}) => {
        setLangState(l)
        if (!local) savePrefs({ lang: l })
        try {
          localStorage.setItem('ss:lang', l)
        } catch {
          /* ignore */
        }
      },
      t: (k, vars) => translate(lang, k, vars),
    }),
    [lang],
  )
  return (
    <I18n.Provider value={value}>
      <Router>
        <Pages />
      </Router>
    </I18n.Provider>
  )
}

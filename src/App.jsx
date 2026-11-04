import { useEffect, useMemo, useState } from 'react'
import { AuthModal, EmailGate, Nav } from './components/Chrome.jsx'
import { I18n, translate } from './i18n.js'
import Landing from './pages/Landing.jsx'
import Own from './pages/Own.jsx'
import Share from './pages/Share.jsx'
import Studio from './pages/Studio.jsx'
import { Link, Router, match, useRouter } from './router.jsx'

function initialLang() {
  try {
    const saved = localStorage.getItem('ss:lang')
    if (saved === 'en' || saved === 'zh') return saved
  } catch {
    /* ignore */
  }
  const q = new URLSearchParams(window.location.search).get('lang')
  if (q === 'zh' || q === 'en') return q
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

function Pages() {
  const { path } = useRouter()
  const [auth, setAuth] = useState(false)
  const m = match(path)
  return (
    <>
      <a href="#main" className="skip">
        Skip to content
      </a>
      <Nav tone={m.page === 'home' ? 'dark' : 'light'} onSignIn={() => setAuth(true)} />
      {m.page === 'home' && <Landing />}
      {m.page === 'own' && <Own />}
      {m.page === 'studio' && <Studio key={m.id} id={m.id} />}
      {m.page === 'share' && <Share key={m.id} id={m.id} />}
      {m.page === 'notfound' && <NotFound />}
      <Footer />
      <EmailGate />
      {auth && <AuthModal onClose={() => setAuth(false)} />}
    </>
  )
}

function NotFound() {
  return (
    <main id="main" className="studio studio--empty">
      <p>Page not found.</p>
      <Link to="/" className="btn btn--glow">
        Sceneshare
      </Link>
    </main>
  )
}

function Footer() {
  return (
    <I18n.Consumer>
      {({ t }) => (
        <footer className="foot">
          <p className="foot__made">{t('foot.made')}</p>
          <p className="foot__fine">{t('foot.disclaimer')}</p>
        </footer>
      )}
    </I18n.Consumer>
  )
}

export default function App() {
  const [lang, setLangState] = useState(initialLang)
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en'
    document.documentElement.dataset.lang = lang
    if (lang === 'zh') loadCjkFonts()
  }, [lang])
  const value = useMemo(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l)
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

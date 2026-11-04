import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// A tiny history router. Routes are listed in match() below.
const Ctx = createContext({ path: '/', navigate: () => {} })

export function Router({ children }) {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const on = () => setPath(window.location.pathname)
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [])
  const navigate = useCallback((to, { replace = false, state = null } = {}) => {
    if (replace) window.history.replaceState(state, '', to)
    else window.history.pushState(state, '', to)
    setPath(new URL(to, window.location.origin).pathname)
    window.scrollTo(0, 0)
  }, [])
  return <Ctx.Provider value={{ path, navigate }}>{children}</Ctx.Provider>
}

export const useRouter = () => useContext(Ctx)

export function Link({ to, children, onClick, ...rest }) {
  const { navigate } = useRouter()
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || rest.target) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

const ID = '([a-z0-9]{6,20})'
export function match(path) {
  let m
  const p = path.replace(/\/+$/, '') || '/'
  if (p === '/') return { page: 'home' }
  if (p === '/studio/new') return { page: 'own' }
  if ((m = new RegExp(`^/studio/${ID}$`).exec(p))) return { page: 'studio', id: m[1] }
  if ((m = new RegExp(`^/p/${ID}$`).exec(p))) return { page: 'share', id: m[1] }
  if (p === '/account') return { page: 'account' }
  if (p === '/admin') return { page: 'admin' }
  if (p === '/reset') return { page: 'reset' }
  if (p === '/terms') return { page: 'legal', doc: 'terms' }
  if (p === '/privacy') return { page: 'legal', doc: 'privacy' }
  if (p === '/cookies') return { page: 'legal', doc: 'cookies' }
  if (p === '/privacy/request') return { page: 'privacyRequest' }
  return { page: 'notfound' }
}

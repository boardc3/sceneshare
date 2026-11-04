import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// A tiny history router: '/', '/studio/:id', '/studio/new', '/p/:id'.
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

export function Link({ to, children, ...rest }) {
  const { navigate } = useRouter()
  return (
    <a
      href={to}
      {...rest}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}

export function match(path) {
  let m
  if (path === '/' || path === '') return { page: 'home' }
  if (path === '/studio/new') return { page: 'own' }
  if ((m = /^\/studio\/([a-z0-9]{6,20})\/?$/.exec(path))) return { page: 'studio', id: m[1] }
  if ((m = /^\/p\/([a-z0-9]{6,20})\/?$/.exec(path))) return { page: 'share', id: m[1] }
  return { page: 'notfound' }
}

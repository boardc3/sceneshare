import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { post, shown } from '../lib/api.js'
import { requireSignIn, useAuth } from '../lib/auth.js'
import { Link, useRouter } from '../router.jsx'

// "Take the photos yourself": an empty home saved to the account. The studio
// then asks for the address (for the map) and takes uploads or camera shots.
export default function Own() {
  const { t, lang } = useI18n()
  const { navigate } = useRouter()
  const { ready } = useAuth()
  const [error, setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (!ready || started.current) return
    started.current = true
    ;(async () => {
      const user = await requireSignIn('own', { type: 'own' })
      if (!user) return navigate('/', { replace: true })
      try {
        const d = await post('/api/property', { own: true, lang })
        track('own_start', null, { propertyId: d.id })
        navigate(`/studio/${d.id}`, { replace: true })
      } catch (e) {
        setError(shown(e) || t('err.generic'))
      }
    })()
  }, [ready, lang, navigate, t])
  return (
    <main id="main" className="page page--center">
      {error ? (
        <>
          <p className="banner banner--error" role="alert">
            {error}
          </p>
          <Link to="/" className="btn btn--quiet">
            {t('notfound.home')}
          </Link>
        </>
      ) : (
        <span className="spinner" aria-hidden="true" />
      )}
    </main>
  )
}

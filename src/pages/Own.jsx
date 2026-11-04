import { useEffect } from 'react'
import { cacheProperty } from '../lib/api.js'
import { useRouter } from '../router.jsx'

// "Take the photos yourself": an empty property made on this device. The studio
// asks for the address (for the map) and takes uploads or camera shots.
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => alphabet[b % alphabet.length]).join('')

export default function Own() {
  const { navigate } = useRouter()
  useEffect(() => {
    const id = newId()
    cacheProperty({ id, createdAt: new Date().toISOString(), address: null, parcel: null, pois: [], photos: [], facts: null, listing: null, listingChecked: true })
    navigate(`/studio/${id}`, { replace: true })
  }, [navigate])
  return null
}

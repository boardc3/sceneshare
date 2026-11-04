import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '../i18n.js'
import { get } from '../lib/api.js'

// Address field with suggestions (WAI-ARIA combobox). Suggestions are a lookup,
// not a submission, so they do not open the email gate; "Find the home" does.
export default function AddressSearch({ onFind, onPreview, busy }) {
  const { t, lang } = useI18n()
  const [value, setValue] = useState('')
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [picked, setPicked] = useState(null)
  const listId = useId()
  const timer = useRef(null)
  const seq = useRef(0)

  useEffect(() => {
    clearTimeout(timer.current)
    if (picked && picked.text === value) return
    if (value.trim().length < 4) {
      setItems([])
      return
    }
    timer.current = setTimeout(async () => {
      const n = ++seq.current
      try {
        const d = await get(`/api/autocomplete?q=${encodeURIComponent(value)}&lang=${lang}`)
        if (n === seq.current) {
          setItems(d.suggestions || [])
          setOpen(true)
          setActive(-1)
        }
      } catch {
        if (n === seq.current) setItems([])
      }
    }, 220)
    return () => clearTimeout(timer.current)
  }, [value, lang, picked])

  const choose = (s) => {
    setPicked(s)
    setValue(s.text)
    setOpen(false)
    onPreview?.(s)
  }

  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    const s = active >= 0 && open ? items[active] : null
    if (s) choose(s)
    const chosen = s || (picked && picked.text === value ? picked : null)
    if (!value.trim()) return
    onFind({ address: chosen ? chosen.text : value.trim(), placeId: chosen?.placeId })
  }

  const onKey = (e) => {
    if (!open || !items.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1))
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <form className="search" onSubmit={submit} role="search">
      <div className="search__field">
        <label htmlFor={`${listId}-in`} className="sr-only">
          {t('hero.placeholder')}
        </label>
        <input
          id={`${listId}-in`}
          type="text"
          role="combobox"
          aria-expanded={open && items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          autoComplete="off"
          placeholder={t('hero.placeholder')}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setPicked(null)
          }}
          onKeyDown={onKey}
          onFocus={() => items.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {open && items.length > 0 && (
          <ul className="search__list" id={listId} role="listbox">
            {items.map((s, i) => (
              <li
                key={s.placeId}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(s)
                }}
              >
                <strong>{s.main}</strong>
                <span>{s.secondary}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="submit" className="btn btn--glow search__go" disabled={busy}>
        {busy ? t('hero.finding') : t('hero.find')}
      </button>
    </form>
  )
}

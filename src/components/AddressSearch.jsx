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
  // Apartment / unit: the building's known units once an address is picked.
  const [units, setUnits] = useState(null) // null = not looked up; [] = none known
  const [unit, setUnit] = useState('')
  const [other, setOther] = useState(false)
  const [showUnit, setShowUnit] = useState(false)
  const [unitError, setUnitError] = useState(false)
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

  const lookupUnits = async (text) => {
    setUnits(null)
    setUnit('')
    setOther(false)
    setUnitError(false)
    try {
      const d = await get(`/api/autocomplete?units=1&q=${encodeURIComponent(text)}&lang=${lang}`)
      const list = d.units || []
      setUnits(list)
      if (d.unit) {
        setUnit(String(d.unit).toUpperCase())
        if (!list.includes(String(d.unit).toUpperCase())) setOther(true)
        setShowUnit(true)
      } else if (list.length > 1) setShowUnit(true)
    } catch {
      setUnits([])
    }
  }

  const choose = (s) => {
    setPicked(s)
    setValue(s.text)
    setOpen(false)
    onPreview?.(s)
    lookupUnits(s.text)
  }

  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    const s = active >= 0 && open ? items[active] : null
    if (s) choose(s)
    const chosen = s || (picked && picked.text === value ? picked : null)
    if (!value.trim()) return
    // A building with several known units: ask which one (or the whole building).
    if (!s && units && units.length > 1 && !unit) {
      setShowUnit(true)
      setUnitError(true)
      return
    }
    const u = unit === '__building' ? '' : unit.trim()
    onFind({ address: chosen ? chosen.text : value.trim(), placeId: chosen?.placeId, unit: u || undefined })
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
            setUnits(null)
            setUnit('')
            setOther(false)
            setUnitError(false)
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
      <div className="search__unit">
        {units && units.length > 1 && showUnit && !other ? (
          <label className={`unitpick ${unitError ? 'unitpick--need' : ''}`}>
            <span>{t('unit.label', { n: units.length })}</span>
            <select
              value={unit}
              onChange={(e) => {
                setUnitError(false)
                if (e.target.value === '__other') {
                  setOther(true)
                  setUnit('')
                } else setUnit(e.target.value)
              }}
              aria-invalid={unitError || undefined}
            >
              <option value="">{t('unit.choose')}</option>
              {units.map((u) => (
                <option key={u} value={u}>
                  {t('unit.option', { u })}
                </option>
              ))}
              <option value="__other">{t('unit.other')}</option>
              <option value="__building">{t('unit.building')}</option>
            </select>
          </label>
        ) : showUnit || other ? (
          <label className={`unitpick ${unitError ? 'unitpick--need' : ''}`}>
            <span>{t('unit.text')}</span>
            <input type="text" value={unit === '__building' ? '' : unit} onChange={(e) => (setUnit(e.target.value.toUpperCase().slice(0, 10)), setUnitError(false))} placeholder={t('unit.ph')} maxLength={10} autoComplete="address-line2" />
            {units && units.length > 1 && (
              <button type="button" className="unitpick__back" onClick={() => (setOther(false), setUnit(''))}>
                {t('unit.list', { n: units.length })}
              </button>
            )}
          </label>
        ) : (
          <button type="button" className="search__addunit" onClick={() => setShowUnit(true)}>
            {t('unit.add')}
          </button>
        )}
        {unitError && (
          <span className="unitpick__msg" role="alert">
            {t('unit.need')}
          </span>
        )}
      </div>
    </form>
  )
}

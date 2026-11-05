import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../i18n.js";
import { track } from "../lib/analytics.js";
import { get } from "../lib/api.js";
import { Modal } from "./Chrome.jsx";

// Address field with suggestions (WAI-ARIA combobox). Suggestions are a lookup,
// not a submission, so they do not open the email gate; "Find the home" does.
// Apartment buildings: on "Find the home", if the building has several known
// units and none was given, a pop-up asks which unit (or the whole building).
export default function AddressSearch({ onFind, onPreview, busy, ownOnlyDefault = false }) {
  const { t, lang } = useI18n();
  const [value, setValue] = useState("");
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState(null);
  const [unit, setUnit] = useState("");
  // Skip the photos from listing sites and work only from the owner's own.
  const [ownOnly, setOwnOnly] = useState(ownOnlyDefault); // '' = none chosen; '__building' = whole building
  const [typing, setTyping] = useState(false); // the "+ Apt or unit" field is open
  const [checking, setChecking] = useState(false);
  const [ask, setAsk] = useState(null); // { address, placeId, units } while the unit pop-up is open
  const listId = useId();
  const timer = useRef(null);
  const seq = useRef(0);
  const unitCache = useRef(new Map());

  useEffect(() => {
    clearTimeout(timer.current);
    if (picked && picked.text === value) return;
    if (value.trim().length < 4) {
      setItems([]);
      return;
    }
    timer.current = setTimeout(async () => {
      const n = ++seq.current;
      try {
        const d = await get(
          `/api/autocomplete?q=${encodeURIComponent(value)}&lang=${lang}`,
        );
        if (n === seq.current) {
          setItems(d.suggestions || []);
          setOpen(true);
          setActive(-1);
        }
      } catch {
        if (n === seq.current) setItems([]);
      }
    }, 220);
    return () => clearTimeout(timer.current);
  }, [value, lang, picked]);

  // Known units at an address (cached; fetched early when a suggestion is picked).
  const unitsFor = (text) => {
    const key = text.trim().toLowerCase();
    if (!unitCache.current.has(key)) {
      unitCache.current.set(
        key,
        get(
          `/api/autocomplete?units=1&q=${encodeURIComponent(text)}&lang=${lang}`,
        )
          .then((d) => ({
            units: d.units || [],
            unit: d.unit ? String(d.unit).toUpperCase() : "",
          }))
          .catch(() => ({ units: [], unit: "" })),
      );
    }
    return unitCache.current.get(key);
  };

  const choose = (s) => {
    setPicked(s);
    setValue(s.text);
    setOpen(false);
    setUnit("");
    onPreview?.(s);
    unitsFor(s.text);
  };

  const go = (address, placeId, u) => {
    const clean = u === "__building" ? "" : String(u || "").trim();
    onFind({ address, placeId, unit: clean || undefined, ownOnly });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || checking) return;
    if (!value.trim()) return;
    // The highlighted suggestion, the picked one, or — if the visitor typed and
    // pressed Find without choosing — the top suggestion.
    const s =
      (active >= 0 && open ? items[active] : null) ||
      (picked && picked.text === value ? picked : null) ||
      (open && items[0] ? items[0] : null);
    if (s && s !== picked) choose(s);
    const address = s ? s.text : value.trim();
    const placeId = s?.placeId;
    if (unit) return go(address, placeId, unit);
    setChecking(true);
    const found = await unitsFor(address);
    setChecking(false);
    if (found.unit) return go(address, placeId, found.unit); // the address already names a unit
    if (found.units.length > 1) {
      setAsk({ address, placeId, units: found.units });
      track("unit_picker_open", { units: found.units.length });
      return;
    }
    go(address, placeId, "");
  };

  const onKey = (e) => {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <>
      <form className="search" onSubmit={submit} role="search">
        <div className="search__field">
          <label htmlFor={`${listId}-in`} className="sr-only">
            {t("hero.placeholder")}
          </label>
          <input
            id={`${listId}-in`}
            type="text"
            role="combobox"
            aria-expanded={open && items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            placeholder={t("hero.placeholder")}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setPicked(null);
              setUnit("");
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
                    e.preventDefault();
                    choose(s);
                  }}
                >
                  <strong>{s.main}</strong>
                  <span>{s.secondary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          className="btn btn--glow search__go"
          disabled={busy || checking}
        >
          {busy || checking ? t("hero.finding") : t("hero.find")}
        </button>
        <div className="search__unit">
          {unit && !typing ? (
            <span className="unitchip">
              {unit === "__building"
                ? t("unit.building")
                : t("unit.option", { u: unit })}
              <button
                type="button"
                className="search__addunit"
                onClick={() => setUnit("")}
              >
                {t("unit.change")}
              </button>
            </span>
          ) : typing ? (
            <label className="unitpick">
              <span>{t("unit.text")}</span>
              <input
                type="text"
                value={unit === "__building" ? "" : unit}
                onChange={(e) =>
                  setUnit(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9 -]/g, "")
                      .slice(0, 10),
                  )
                }
                placeholder={t("unit.ph")}
                maxLength={10}
                autoComplete="address-line2"
              />
            </label>
          ) : (
            <button
              type="button"
              className="search__addunit"
              onClick={() => setTyping(true)}
            >
              {t("unit.add")}
            </button>
          )}
          <label className="search__own">
            <input
              type="checkbox"
              checked={ownOnly}
              onChange={(e) => setOwnOnly(e.target.checked)}
            />
            <span>{t("search.ownOnly")}</span>
          </label>
        </div>
      </form>
      {ask &&
        createPortal(
          <UnitPicker
            address={ask.address}
            units={ask.units}
            onPick={(u) => {
              setAsk(null);
              setTyping(false);
              setUnit(u);
              track("unit_picked", {
                building: u === "__building",
                listed: ask.units.includes(u),
              });
              go(ask.address, ask.placeId, u);
            }}
            onClose={() => setAsk(null)}
          />,
          document.body,
        )}
    </>
  );
}

function UnitPicker({ address, units, onPick, onClose }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState("");
  const [other, setOther] = useState("");
  const shown = useMemo(() => {
    const f = filter.trim().toUpperCase();
    return f ? units.filter((u) => u.includes(f)) : units;
  }, [units, filter]);
  const street = address.split(",")[0];
  return (
    <Modal labelledBy="unit-h" onClose={onClose} wide>
      <p className="page__eyebrow">{t("unit.eyebrow", { n: units.length })}</p>
      <h2 id="unit-h">{t("unit.title")}</h2>
      <p className="unitmodal__addr">{street}</p>
      {units.length > 12 && (
        <label className="field">
          <span>{t("unit.filter")}</span>
          <input
            type="text"
            inputMode="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("unit.ph")}
            autoFocus={!window.matchMedia?.('(pointer: coarse)').matches}
          />
        </label>
      )}
      <div className="unitgrid" role="list">
        {shown.map((u) => (
          <button
            key={u}
            type="button"
            role="listitem"
            className="unitgrid__btn"
            onClick={() => onPick(u)}
          >
            {u}
          </button>
        ))}
        {!shown.length && <p className="fine">{t("unit.none")}</p>}
      </div>
      <form
        className="unitmodal__other"
        onSubmit={(e) => {
          e.preventDefault();
          if (other.trim()) onPick(other.trim().toUpperCase());
        }}
      >
        <label className="field">
          <span>{t("unit.other")}</span>
          <input
            type="text"
            value={other}
            onChange={(e) =>
              setOther(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9 -]/g, "")
                  .slice(0, 10),
              )
            }
            placeholder={t("unit.ph")}
            maxLength={10}
          />
        </label>
        <button
          type="submit"
          className="btn btn--ink btn--small"
          disabled={!other.trim()}
        >
          {t("unit.use")}
        </button>
      </form>
      <div className="dialog__actions">
        <button
          type="button"
          className="btn btn--quiet"
          onClick={() => onPick("__building")}
        >
          {t("unit.building")}
        </button>
        <button type="button" className="btn btn--quiet" onClick={onClose}>
          {t("unit.cancel")}
        </button>
      </div>
    </Modal>
  );
}

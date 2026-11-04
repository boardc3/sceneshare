import { versionFor } from '../../shared/model.js'

// Names and images for the "compare any two" pickers, in the studio and on the
// buyer page. A side is 'original' or a design id.

export function designName(d, t) {
  if (!d) return ''
  const light = t(`light.${d.light || 'daylight'}`)
  return d.mode === 'polish' ? `${t('design.relit')} · ${light}` : `${t(`style.${d.style || 'signature'}`)} · ${light}`
}

export function designLabel(d, i, t) {
  return `${t('design.n', { n: i + 1 })} — ${designName(d, t)}`
}

export function sideImage(property, side, photo) {
  if (!photo) return null
  if (side === 'original') return { src: photo.src, width: photo.width, height: photo.height, original: true }
  const v = versionFor(property, side, photo.id)
  return v ? { src: v.src, width: v.width, height: v.height, version: v } : null
}

export function sideLabel(property, side, t) {
  if (side === 'original') return t('studio.current')
  const i = property.designs.findIndex((d) => d.id === side)
  return i >= 0 ? designLabel(property.designs[i], i, t) : ''
}

export function shortSideLabel(property, side, t) {
  if (side === 'original') return t('studio.current')
  const d = property.designs.find((x) => x.id === side)
  return d ? designName(d, t) : ''
}

// Default comparison: the original against the featured design (or the newest).
export function defaultSides(property) {
  const withPicks = (property?.designs || []).filter((d) => Object.keys(d.picks || {}).length)
  const right = property?.featured && withPicks.some((d) => d.id === property.featured) ? property.featured : withPicks[withPicks.length - 1]?.id || null
  return { left: 'original', right }
}

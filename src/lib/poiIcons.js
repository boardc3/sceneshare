// One icon per kind of place, shared by the map markers and the legend
// (24 × 24, stroked, drawn in currentColor).
export const POI_ICONS = {
  home: 'M3.5 11 12 4l8.5 7M5.5 9.5V20h5v-5.5h3V20h5V9.5',
  beach: 'M12 4a8 8 0 0 1 8 8H4a8 8 0 0 1 8-8zM12 12l3 8M3 20.5c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0',
  park: 'M12 3l5 6.5h-3l4 5.5H6l4-5.5H7zM12 15v6',
  school: 'M2.5 9 12 4.5 21.5 9 12 13.5zM6.5 11v4.5c3.5 2.5 7.5 2.5 11 0V11M21.5 9v5',
  grocery: 'M3 4h2.2l2.2 10.5h10.4L20 7H6.2M9 19.5h.01M17 19.5h.01',
  cafe: 'M4.5 9h12v4.5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 10.5h1.2a2.3 2.3 0 0 1 0 4.6h-1.5M8 3.5v2.5M11 3.5v2.5M14 3.5v2.5',
  hospital: 'M4.5 4.5h15v15h-15zM12 8v8M8 12h8',
  dining: 'M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M17 3c-1.7 1.4-2.5 3.6-2.5 6.5V13h2.5v8',
  shopping: 'M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8',
  train: 'M7 3.5h10a2 2 0 0 1 2 2v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 14.5v-9a2 2 0 0 1 2-2zM5 10h14M9 13.5h.01M15 13.5h.01M8.5 17l-2 3.5M15.5 17l2 3.5',
  airport: 'M21 15.5 13.5 12V5.5a1.5 1.5 0 0 0-3 0V12L3 15.5v2l7.5-2.2V19l-2 1.5V22l3.5-1 3.5 1v-1.5l-2-1.5v-3.7l7.5 2.2z',
}

POI_ICONS.pharmacy = 'M9 3.5h6v5.5h5.5v6H15v5.5H9V15H3.5V9H9z'
POI_ICONS.gym = 'M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12'
POI_ICONS.elementary = POI_ICONS.school
POI_ICONS.middle = POI_ICONS.school
POI_ICONS.high = POI_ICONS.school

export function iconSvg(kind, size = 16) {
  const d = POI_ICONS[kind] || POI_ICONS.home
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', d)
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.9')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')
  svg.appendChild(path)
  return svg
}

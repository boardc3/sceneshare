import { normalizeProperty, visiblePhotos } from '../../shared/model.js'
import { TERMS_VERSION } from '../_lib/config.js'
import { ownerAccepted, propertyRow } from '../_lib/db.js'
import { validId } from '../_lib/gate.js'
import { logRequest } from '../_lib/log.js'

// A shared home's link (/p/<id>) is served through here so link previews — iMessage,
// WhatsApp, email, Slack, LinkedIn — show THAT home: its address, its facts, and a
// before/after image of it (/api/og). People get the normal app; only the <head>
// differs. vercel.json rewrites /p/<id> to /api/page?id=<id>.

let shell = null
async function appShell(origin) {
  if (shell) return shell
  const r = await fetch(`${origin}/index.html`)
  if (!r.ok) throw new Error(`index.html ${r.status}`)
  shell = await r.text()
  return shell
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const num = (n) => (n == null ? null : Number(n).toLocaleString('en-US'))

function head({ title, description, image, url, imageType = 'image/jpeg' }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Sceneshare" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:secure_url" content="${esc(image)}" />`,
    `<meta property="og:image:type" content="${imageType}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(title)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join('\n    ')
}

// Remove the homepage's own title / description / Open Graph tags before adding these.
const strip = (html) =>
  html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s*<meta\s+(?:name="description"|property="og:[^"]+"|name="twitter:[^"]+")[^>]*>/gi, '')

export default async function handler(req, res) {
  const started = Date.now()
  const u = new URL(req.url, 'http://local')
  const id = u.searchParams.get('id') || ''
  const zh = u.searchParams.get('lang') === 'zh'
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '')
  const origin = `${/^(localhost|127\.)/.test(host) ? 'http' : 'https'}://${host}`
  let status = 200
  try {
    const html = await appShell(origin)
    const row = validId(id) ? await propertyRow(id).catch(() => null) : null
    let meta
    if (!row) {
      status = 404
      meta = head({ title: 'Sceneshare', description: 'This home is no longer shared.', image: `${origin}/media/og-home-2.jpg`, url: `${origin}/` })
    } else if (!ownerAccepted(row, TERMS_VERSION)) {
      // Not visible yet: the preview says nothing about the home.
      meta = head({ title: zh ? 'Sceneshare 上分享的房屋' : 'A home shared on Sceneshare', description: zh ? '分享者完成设置后即可查看这套房屋。' : 'This home will be viewable once the person sharing it finishes setting it up.', image: `${origin}/media/og-home-2.jpg`, url: `${origin}/p/${id}${zh ? '?lang=zh' : ''}` })
    } else {
      const p = normalizeProperty(row.data)
      const a = p.address
      const street = a ? `${a.streetNumber} ${a.route}${a.unit ? ` #${a.unit}` : ''}` : 'A home on Sceneshare'
      const place = a ? `${a.city}, ${a.state}` : ''
      const f = p.facts || {}
      const facts = [f.beds && `${f.beds} bd`, f.baths && `${f.baths} ba`, f.livingArea && `${num(f.livingArea)} sq ft`].filter(Boolean).join(' · ')
      const designs = p.designs.filter((d) => Object.keys(d.picks).length).length
      const title = place ? `${street}, ${place}` : street
      const description = zh
        ? `${facts ? `${facts} · ` : ''}${designs ? `${designs} 个设计方案 · ` : ''}每个房间的原始照片与设计提案，以及地理位置。`
        : `${facts ? `${facts} · ` : ''}${designs ? `${designs} design${designs > 1 ? 's' : ''} · ` : ''}Every room as photographed and as it could be, plus the location.`
      const version = new Date(row.updated_at).getTime().toString(36)
      const hasPhoto = visiblePhotos(p).length > 0
      meta = head({
        title,
        description,
        image: hasPhoto ? `${origin}/api/og?id=${id}&v=${version}` : `${origin}/media/og-home-2.jpg`,
        url: `${origin}/p/${id}${zh ? '?lang=zh' : ''}`,
      })
    }
    const out = strip(html).replace(/<head>/i, `<head>\n    ${meta}`)
    res.statusCode = status
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=600')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    res.end(out)
  } catch (e) {
    status = 500
    console.error(JSON.stringify({ t: 'page', msg: 'render failed', id, err: String(e?.message || e).slice(0, 300) }))
    // Never leave a buyer on an error: send the plain app, which loads the home itself.
    res.statusCode = 302
    res.setHeader('Location', `/p/${encodeURIComponent(id)}?plain=1${zh ? '&lang=zh' : ''}`)
    res.end()
  } finally {
    logRequest(req, { route: 'page', status, ms: Date.now() - started, meta: { propertyId: id } })
  }
}

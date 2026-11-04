import { fetchWithTimeout } from './http.js'
import { config } from './config.js'

// Share emails sent by Sceneshare itself (only when RESEND_API_KEY and
// SHARE_FROM_EMAIL are set). Plain, personal, one link; replies go to the sender.
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

const T = {
  en: {
    subject: (who, address) => `${who ? `${who} shared` : 'A home shared with you:'} ${address}`,
    intro: (who) => `${who || 'Someone'} thinks you’ll want to see this home — every room as photographed and as it could be, plus the neighborhood.`,
    cta: 'Open the home',
    foot: 'You received this because someone entered your address on Sceneshare. We don’t add you to any list.',
  },
  zh: {
    subject: (who, address) => `${who ? `${who} 与您分享了` : '与您分享的房屋：'}${address}`,
    intro: (who) => `${who || '有人'}认为您会想看看这套房屋——每个房间的原始照片与设计提案，以及周边环境。`,
    cta: '打开房屋页面',
    foot: '您收到此邮件是因为有人在 Sceneshare 上填写了您的邮箱。我们不会将您加入任何邮件列表。',
  },
}

export async function sendShareEmail({ to, replyTo, senderName, message, url, address, lang = 'en' }) {
  const t = T[lang] || T.en
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16212b">
  <p style="font-size:16px;line-height:1.5">${esc(t.intro(senderName))}</p>
  ${message ? `<p style="font-size:16px;line-height:1.5;padding:12px 16px;background:#edf0ee;border-radius:8px">${esc(message).replace(/\n/g, '<br>')}</p>` : ''}
  <p style="font-size:18px;font-weight:600">${esc(address)}</p>
  <p><a href="${esc(url)}" style="display:inline-block;background:#e8a548;color:#16212b;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">${esc(t.cta)}</a></p>
  <p style="font-size:12px;color:#56656c">${esc(t.foot)}</p></div>`
  const text = `${t.intro(senderName)}\n\n${message ? `${message}\n\n` : ''}${address}\n${url}\n\n${t.foot}`
  try {
    const r = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.mailKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.mailFrom, to, subject: t.subject(senderName, address), html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      },
      15000,
    )
    if (!r.ok) console.error(JSON.stringify({ t: 'mail', msg: 'send failed', status: r.status, detail: (await r.text()).slice(0, 300) }))
    return r.ok
  } catch (e) {
    console.error(JSON.stringify({ t: 'mail', msg: 'send failed', err: e.message }))
    return false
  }
}

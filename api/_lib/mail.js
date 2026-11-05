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

// To an owner whose home someone tried to open before the owner accepted the Terms.
export async function sendTermsRequestEmail({ to, ownerName, address, acceptUrl, requesterEmail = null }) {
  const who = requesterEmail ? esc(requesterEmail) : 'Someone'
  const subject = `${requesterEmail || 'Someone'} wants to see ${address || 'your home'} on Sceneshare`
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16212b">
  <p style="font-size:16px;line-height:1.5">Hi${ownerName ? ` ${esc(ownerName)}` : ''},</p>
  <p style="font-size:16px;line-height:1.5">${who} opened the link you shared for <strong>${esc(address || 'your home')}</strong>, but it isn’t visible yet.</p>
  <p style="font-size:16px;line-height:1.5">Before Sceneshare can show any home you share, please confirm once that you have the rights or permission to share it, and accept our Terms of Service. It takes a few seconds and covers every home you share.</p>
  <p><a href="${esc(acceptUrl)}" style="display:inline-block;background:#e8a548;color:#16212b;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Review and accept</a></p>
  ${requesterEmail ? `<p style="font-size:14px;color:#56656c">You can reply to this email to reach ${esc(requesterEmail)}.</p>` : ''}
  <p style="font-size:12px;color:#56656c">You received this because a home was shared from your Sceneshare account.</p></div>`
  const text = `${requesterEmail || 'Someone'} opened the link you shared for ${address || 'your home'}, but it isn't visible yet.\n\nBefore Sceneshare can show any home you share, confirm once that you have the rights or permission to share it, and accept our Terms of Service:\n${acceptUrl}\n`
  try {
    const r = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.mailKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html, text, ...(requesterEmail ? { reply_to: requesterEmail } : {}) }),
      },
      15000,
    )
    if (!r.ok) console.error(JSON.stringify({ t: 'mail', msg: 'terms request send failed', status: r.status, detail: (await r.text()).slice(0, 300) }))
    return r.ok
  } catch (e) {
    console.error(JSON.stringify({ t: 'mail', msg: 'terms request send failed', err: e.message }))
    return false
  }
}

// A buyer opened a share link after the owner's plan ended (pages are offline 14
// days after): tell the owner, with a way to bring the page back.
export async function sendRenewRequestEmail({ to, ownerName, address, renewUrl, requesterEmail = null }) {
  const who = requesterEmail ? esc(requesterEmail) : 'Someone'
  const subject = `${requesterEmail || 'Someone'} tried to see ${address || 'your home'} on Sceneshare`
  const html = `<div style="font-family:Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16212b">
  <p style="font-size:16px;line-height:1.5">Hi${ownerName ? ` ${esc(ownerName)}` : ''},</p>
  <p style="font-size:16px;line-height:1.5">${who} opened the link you shared for <strong>${esc(address || 'your home')}</strong>, but the page is offline because your Sceneshare plan has ended.</p>
  <p style="font-size:16px;line-height:1.5">Choose a plan and every home you’ve shared comes back online, with the same links.</p>
  <p><a href="${esc(renewUrl)}" style="display:inline-block;background:#e8a548;color:#16212b;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Bring my pages back</a></p>
  ${requesterEmail ? `<p style="font-size:14px;color:#56656c">You can reply to this email to reach ${esc(requesterEmail)}.</p>` : ''}
  <p style="font-size:12px;color:#56656c">You received this because a home was shared from your Sceneshare account.</p></div>`
  const text = `${requesterEmail || 'Someone'} opened the link you shared for ${address || 'your home'}, but the page is offline because your Sceneshare plan has ended.\n\nChoose a plan and your pages come back online with the same links:\n${renewUrl}\n`
  try {
    const r = await fetchWithTimeout(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.mailKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.mailFrom, to: [to], subject, html, text, ...(requesterEmail ? { reply_to: requesterEmail } : {}) }),
      },
      15000,
    )
    if (!r.ok) console.error(JSON.stringify({ t: 'mail', msg: 'renew request send failed', status: r.status }))
    return r.ok
  } catch (e) {
    console.error(JSON.stringify({ t: 'mail', msg: 'renew request send failed', err: e.message }))
    return false
  }
}

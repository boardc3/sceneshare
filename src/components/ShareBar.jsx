import { useState } from 'react'
import { translate, useI18n } from '../i18n.js'
import { track } from '../lib/analytics.js'
import { post } from '../lib/api.js'
import { useAuth } from '../lib/auth.js'
import { isEmail } from '../lib/format.js'
import { Modal } from './Chrome.jsx'

const mobile = () => /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent)
const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('')

// Share a home. Every share gets its own tracked link (/p/<id>?s=<share>) so the
// owner can see how often the home was shared and how often each share was opened.
// Email opens a short form; text, copy and the phone's share sheet work instantly.
export default function ShareBar({ id, address, owner = false, disabled = false, onShared }) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const [linkLang, setLinkLang] = useState(lang)
  const [copied, setCopied] = useState(false)
  const [emailOpen, setEmailOpen] = useState(false)
  const L = owner ? linkLang : lang
  const tl = (k, vars) => translate(L, k, vars)
  const linkFor = (shareId) => `${window.location.origin}/p/${id}?s=${shareId}${L === 'zh' ? '&lang=zh' : ''}`

  // Record the share in the background; the link already works.
  const record = (channel, shareId) => {
    post('/api/shares', { propertyId: id, channel, id: shareId, lang: L })
      .then(() => onShared?.())
      .catch(() => {})
    track(`share_${channel}`, { linkLang: L, owner }, { propertyId: id })
  }

  const copy = async () => {
    const sid = rid()
    const url = linkFor(sid)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt(t('share.copy'), url)
    }
    record('copy', sid)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }
  const text = () => {
    const sid = rid()
    record('text', sid)
    window.location.href = `sms:?&body=${encodeURIComponent(`${tl(owner ? 'share.mailSubjectOwner' : 'share.mailSubject', { address })} ${linkFor(sid)}`)}`
  }
  const native = async () => {
    const sid = rid()
    try {
      await navigator.share({ title: address || 'Sceneshare', text: tl('share.mailSubject', { address }), url: linkFor(sid) })
      record('native', sid)
    } catch {
      /* cancelled */
    }
  }

  return (
    <div className="sharebar" role="group" aria-label={t('share.title')}>
      {owner && (
        <div className="seg seg--tiny" role="group" aria-label={t('share.linkLang')}>
          <button type="button" aria-pressed={linkLang === 'en'} onClick={() => setLinkLang('en')} title={t('share.linkLang')}>
            EN
          </button>
          <button type="button" aria-pressed={linkLang === 'zh'} onClick={() => setLinkLang('zh')} title={t('share.linkLang')}>
            中文
          </button>
        </div>
      )}
      <button type="button" className="btn btn--glow btn--small" onClick={() => (setEmailOpen(true), track('share_email_open', null, { propertyId: id }))} disabled={disabled}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="M3 6h18v12H3zM3 7l9 7 9-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
        {t('share.email')}
      </button>
      {mobile() && (
        <button type="button" className="btn btn--quiet btn--small" onClick={text} disabled={disabled}>
          {t('share.text')}
        </button>
      )}
      <button type="button" className="btn btn--quiet btn--small" onClick={copy} disabled={disabled}>
        {copied ? t('share.copied') : t('share.copy')}
      </button>
      {mobile() && navigator.share && (
        <button type="button" className="btn btn--quiet btn--small" onClick={native} disabled={disabled}>
          {t('share.more')}
        </button>
      )}
      {emailOpen && (
        <EmailShare
          id={id}
          address={address}
          owner={owner}
          lang={L}
          defaultName={user?.name || ''}
          linkFor={linkFor}
          onClose={() => setEmailOpen(false)}
          onShared={onShared}
        />
      )}
    </div>
  )
}

function EmailShare({ id, address, owner, lang, defaultName, linkFor, onClose, onShared }) {
  const { t } = useI18n()
  const tl = (k, vars) => translate(lang, k, vars)
  const [to, setTo] = useState('')
  const [name, setName] = useState(defaultName)
  const [message, setMessage] = useState(tl(owner ? 'share.defaultOwner' : 'share.defaultBuyer', { address }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null) // 'sent' | 'mailapp'
  const [tracked, setTracked] = useState(true)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    const list = to.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean)
    if (!list.length) return setError(t('share.form.needTo'))
    const bad = list.find((x) => !isEmail(x))
    if (bad) return setError(t('share.form.badTo', { email: bad }))
    if (list.length > 10) return setError(t('share.form.tooMany'))
    setBusy(true)
    const sid = rid()
    try {
      const d = await post('/api/shares', { propertyId: id, channel: 'email', id: sid, recipients: list.join(','), name: name.trim(), message: message.trim(), lang, tracked })
      onShared?.()
      track('share_email', { recipients: list.length, sent: d.sent, owner, linkLang: lang, tracked }, { propertyId: id })
      if (d.sent) setDone('sent')
      else {
        const subject = tl(owner ? 'share.mailSubjectOwner' : 'share.mailSubject', { address })
        const link = tracked ? linkFor(sid) : `${window.location.origin}/p/${id}${lang === 'zh' ? '?lang=zh' : ''}`
        const body = `${message.trim()}\n\n${address}\n${link}\n${name.trim() ? `\n— ${name.trim()}\n` : ''}`
        window.location.href = `mailto:${list.map(encodeURIComponent).join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
        setDone('mailapp')
      }
    } catch (err) {
      setError(err.message || t('err.generic'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy="es-h" onClose={onClose}>
      <h2 id="es-h">{t('share.form.title')}</h2>
      {done ? (
        <>
          <p className="banner banner--ok" role="status">
            {done === 'sent' ? t('share.form.sent') : t('share.form.mailapp')}
          </p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--glow" onClick={onClose}>
              {t('gate.close')}
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <p>{address}</p>
          <label className="field">
            <span>{t('share.form.to')}</span>
            <input type="text" inputMode="email" autoComplete="off" value={to} onChange={(e) => setTo(e.target.value)} placeholder={t('share.form.toPh')} />
          </label>
          <label className="field">
            <span>{t('share.form.name')}</span>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
          </label>
          <label className="field">
            <span>{t('share.form.message')}</span>
            <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
          </label>
          {error && (
            <p className="field__error" role="alert">
              {error}
            </p>
          )}
          <label className="check">
            <input type="checkbox" checked={tracked} onChange={(e) => setTracked(e.target.checked)} />
            <span>{t('share.form.track')}</span>
          </label>
          <p className="fine">
            {t('share.form.fine')} <a href="/terms#sharing" target="_blank" rel="noreferrer">{t('legal.terms')}</a>
          </p>
          <div className="dialog__actions">
            <button type="button" className="btn btn--quiet" onClick={onClose}>
              {t('gate.cancel')}
            </button>
            <button type="submit" className="btn btn--glow" disabled={busy}>
              {busy ? t('auth.working') : t('share.form.send')}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

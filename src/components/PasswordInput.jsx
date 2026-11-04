import { useState } from 'react'
import { useI18n } from '../i18n.js'

// A password field with a show/hide toggle.
export default function PasswordInput({ value, onChange, autoComplete = 'current-password', ...rest }) {
  const { t } = useI18n()
  const [show, setShow] = useState(false)
  return (
    <span className="pw">
      <input type={show ? 'text' : 'password'} autoComplete={autoComplete} value={value} onChange={onChange} minLength={8} spellCheck={false} {...rest} />
      <button type="button" className="pw__toggle" onClick={() => setShow((s) => !s)} aria-pressed={show} aria-label={show ? t('auth.hidePw') : t('auth.showPw')}>
        {show ? t('auth.hide') : t('auth.show')}
      </button>
    </span>
  )
}

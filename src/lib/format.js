export const isEmail = (s) => typeof s === 'string' && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/.test(s.trim())

export const num = (n, lang) => (n == null || n === '' ? null : Number(n).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US'))

// Lot size in square feet from Zillow's value + unit.
export function lotSqft(facts) {
  if (!facts?.lotArea) return null
  const unit = String(facts.lotAreaUnit || '').toLowerCase()
  if (unit.startsWith('acre')) return facts.lotArea * 43560
  return facts.lotArea
}

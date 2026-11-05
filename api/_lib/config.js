// Every external service is optional except Gemini: the app reports what is
// configured at /api/health and degrades feature by feature.
const env = process.env

// Vercel's Neon integration names its variables with the prefix chosen at install
// (this project: SCENESHARE_DATABASE_URL). Take the plain names first, then any
// pooled *_DATABASE_URL / *_POSTGRES_URL the integration added.
function databaseUrl() {
  if (env.DATABASE_URL) return env.DATABASE_URL
  if (env.POSTGRES_URL) return env.POSTGRES_URL
  const keys = Object.keys(env).sort()
  const pick = (re) => keys.find((k) => re.test(k) && env[k])
  const k = pick(/_DATABASE_URL$/) || pick(/_POSTGRES_URL$/)
  return k ? env[k] : ''
}

// Neon Auth (managed Better Auth), provisioned by the same Vercel integration:
// SCENESHARE_NEON_AUTH_BASE_URL (server) and SCENESHARE_VITE_NEON_AUTH_URL (same
// URL, meant for a browser build). We read either; the browser never talks to it
// directly — /api/auth proxies it so the session cookie is first-party.
function authUrl() {
  const keys = Object.keys(env).sort()
  const k =
    (env.NEON_AUTH_BASE_URL && 'NEON_AUTH_BASE_URL') ||
    keys.find((x) => /_NEON_AUTH_BASE_URL$/.test(x) && env[x]) ||
    (env.VITE_NEON_AUTH_URL && 'VITE_NEON_AUTH_URL') ||
    keys.find((x) => /_NEON_AUTH_URL$/.test(x) && env[x])
  return k ? String(env[k]).trim().replace(/\/+$/, '') : ''
}

// Who may open /admin (signed in, email verified). Comma-separated.
// Super admins (Chris, 2026-11-05: chris@sceneset.ai) also see every user's own
// activity; they are always admins too.
const list = (v) =>
  String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
const superAdminEmails = list(env.SUPER_ADMIN_EMAILS || 'chris@sceneset.ai,chris@ccolbert.com')
const adminEmails = [...new Set([...list(env.ADMIN_EMAILS || 'chris@ccolbert.com'), ...superAdminEmails])]

export const config = {
  authUrl: authUrl(),
  // Optional; when unset the session-cache cookie is signed with a key derived
  // from the database URL (a server-only secret), so no extra setup is needed.
  authSecret: env.AUTH_COOKIE_SECRET || '',
  adminEmails,
  superAdminEmails,
  // Accounts allowed to use preview-mode purchases besides admins (comma-separated).
  previewTesters: list(env.PREVIEW_TESTER_EMAILS),
  production: env.VERCEL_ENV === 'production',
  siteUrl: String(env.SITE_URL || 'https://www.sceneshare.app').replace(/\/+$/, ''),
  geminiKey: env.GOOGLE_API_KEY || env.GEMINI_API_KEY || '',
  // "Nano Banana 2" = Gemini 3.1 Flash Image. Override without a redeploy of code.
  imageModel: env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image',
  imageModelFallback: env.GEMINI_IMAGE_MODEL_FALLBACK || 'gemini-3.1-flash-image-preview',
  imageSize: env.GEMINI_IMAGE_SIZE || '2K',
  // Mapbox public token (pk.…) — used server-side for geocoding and nearby places,
  // and handed to the browser for the maps. Restrict it to your domains in Mapbox.
  mapboxToken: env.MAPBOX_TOKEN || env.MAPBOX_ACCESS_TOKEN || env.VITE_MAPBOX_TOKEN || '',
  mapboxPermanent: /^(1|true|yes)$/i.test(env.MAPBOX_PERMANENT_GEOCODING || ''),
  scraperKey: env.SCRAPERAPI_KEY || '',
  blobToken: env.BLOB_READ_WRITE_TOKEN || '',
  databaseUrl: databaseUrl(),
  maxListingPhotos: Number(env.MAX_LISTING_PHOTOS || 24),
  // Optional: send share emails ourselves (Resend). Needs a verified sending domain,
  // e.g. SHARE_FROM_EMAIL="Sceneshare <homes@sceneshare.app>". Without these the
  // sender's own mail app sends the email, with the same tracked link.
  mailKey: env.RESEND_API_KEY || '',
  mailFrom: env.SHARE_FROM_EMAIL || '',
  // Billing (api/_lib/billing.js). BILLING_MODE: off | preview | stripe.
  //   preview (default): plans, limits and the upgrade flow all work, no card is taken.
  //   stripe: Stripe Checkout. Test keys (sk_test_…) never charge real cards;
  //   live keys (sk_live_…) only work with STRIPE_ALLOW_LIVE=1.
  billingMode: String(env.BILLING_MODE || '').trim().toLowerCase().replace(/^['"]|['"]$/g, ''),
  stripeKey: String(env.STRIPE_SECRET_KEY || '').trim().replace(/^['"]|['"]$/g, ''),
  stripeWebhookSecret: String(env.STRIPE_WEBHOOK_SECRET || '').trim().replace(/^['"]|['"]$/g, ''),
  stripeAllowLive: /^(1|true|yes)$/i.test(env.STRIPE_ALLOW_LIVE || ''),
}

// The Terms an account accepts before its homes can be shared. Bump when the
// sharing terms change materially: every owner is then asked to accept again.
export const TERMS_VERSION = '2026-11-04'

export const features = () => ({
  render: Boolean(config.geminiKey),
  maps: Boolean(config.mapboxToken),
  scraper: Boolean(config.scraperKey),
  storage: Boolean(config.blobToken || config.databaseUrl),
  blob: Boolean(config.blobToken),
  database: Boolean(config.databaseUrl),
  sharing: Boolean(config.databaseUrl),
  accounts: Boolean(config.authUrl && config.databaseUrl),
  mail: Boolean(config.mailKey && config.mailFrom),
  billing: billingState(),
})

// What billing does right now: 'off', 'preview' (no money moves), 'test' (Stripe
// test mode) or 'live'. A missing or refused Stripe key falls back to preview.
export function billingState() {
  return billingCheck().state
}

// Why billing is in the state it is — names the setting at fault, never its value.
export function billingCheck() {
  const mode = config.billingMode
  if (mode === 'off') return { state: 'off', reason: 'BILLING_MODE is off' }
  if (mode !== 'stripe') return { state: 'preview', reason: mode && mode !== 'preview' ? 'BILLING_MODE is not "stripe", "preview" or "off"' : 'BILLING_MODE is not "stripe"' }
  const key = config.stripeKey
  if (!key) return { state: 'preview', reason: 'STRIPE_SECRET_KEY is missing' }
  if (/^pk_/.test(key)) return { state: 'preview', reason: 'STRIPE_SECRET_KEY is a publishable key (pk_…); use the secret key (sk_test_…)' }
  if (/^(sk|rk)_test_/.test(key)) return { state: 'test', reason: config.stripeWebhookSecret ? 'ok' : 'STRIPE_WEBHOOK_SECRET is missing' }
  if (/^(sk|rk)_live_/.test(key)) return config.stripeAllowLive ? { state: 'live', reason: config.stripeWebhookSecret ? 'ok' : 'STRIPE_WEBHOOK_SECRET is missing' } : { state: 'preview', reason: 'live key without STRIPE_ALLOW_LIVE=1' }
  return { state: 'preview', reason: 'STRIPE_SECRET_KEY does not look like a Stripe secret key (sk_test_…)' }
}

// Origins that belong to Sceneshare: production, this project's Vercel previews, and
// (outside production) local development. Used for links we build and to refuse
// state-changing requests sent from other sites.
const TRUSTED_ORIGINS = [/^https:\/\/(www\.)?sceneshare\.app$/, /^https:\/\/sceneshare-[a-z0-9-]+\.vercel\.app$/]
const DEV_ORIGINS = [/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^https:\/\/[a-z0-9.-]+\.test$/]
export const isTrustedOrigin = (o) => typeof o === 'string' && (TRUSTED_ORIGINS.some((re) => re.test(o)) || (!config.production && DEV_ORIGINS.some((re) => re.test(o))))

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
const adminEmails = (env.ADMIN_EMAILS || 'chris@ccolbert.com')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

export const config = {
  authUrl: authUrl(),
  // Optional; when unset the session-cache cookie is signed with a key derived
  // from the database URL (a server-only secret), so no extra setup is needed.
  authSecret: env.AUTH_COOKIE_SECRET || '',
  adminEmails,
  production: env.VERCEL_ENV === 'production',
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
}

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
})

// Every external service is optional except Gemini: the app reports what is
// configured at /api/health and degrades feature by feature.
const env = process.env

export const config = {
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
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
  maxListingPhotos: Number(env.MAX_LISTING_PHOTOS || 24),
}

export const features = () => ({
  render: Boolean(config.geminiKey),
  maps: Boolean(config.mapboxToken),
  scraper: Boolean(config.scraperKey),
  storage: Boolean(config.blobToken),
  database: Boolean(config.databaseUrl),
  sharing: Boolean(config.blobToken && config.databaseUrl),
  accounts: false,
})

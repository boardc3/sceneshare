import { neon } from '@neondatabase/serverless'
import { config } from './config.js'

// Neon Postgres holds everything Sceneshare learns and makes:
//   leads         one row per email captured (first/last seen, language, country, count)
//   submissions   every action a visitor takes, with its details (the audit log)
//   properties    each home: address, parcel, nearby places, facts, listing links,
//                 plus `data`, the full snapshot the buyer page is drawn from
//   photos        every photo of a home: listing, owner upload; source URL and our copy
//   renders       every restyle / relight / change request: settings, model, timing,
//                 alignment score, and the image
//   share_views   each time a buyer opens a share link
//   images        image bytes, used when Vercel Blob is not set up (served by /api/media)
//   users         placeholder for accounts (not wired yet)
// Tables are created and upgraded on first use, so a fresh Neon database needs no
// setup step and an older one gains new columns automatically.

let sql = null
let ready = null

function db() {
  if (!config.databaseUrl) return null
  if (!sql) sql = neon(config.databaseUrl)
  return sql
}

// Tests swap in another Postgres (an in-memory PGlite) through this hook.
export function __setSql(fn) {
  sql = fn
  ready = null
}

const j = (v) => (v === undefined || v === null ? null : JSON.stringify(v))

async function migrate(s) {
  await s`create table if not exists leads (
    email text primary key,
    first_seen timestamptz not null default now(),
    last_seen timestamptz not null default now(),
    lang text,
    submissions integer not null default 0
  )`
  await s`alter table leads add column if not exists country text`
  await s`alter table leads add column if not exists region text`
  await s`alter table leads add column if not exists user_agent text`
  await s`alter table leads add column if not exists referrer text`
  await s`alter table leads add column if not exists first_context text`

  await s`create table if not exists submissions (
    id bigserial primary key,
    email text not null,
    kind text not null,
    address text,
    property_id text,
    lang text,
    meta jsonb,
    created_at timestamptz not null default now()
  )`
  await s`create index if not exists submissions_email_idx on submissions (email, created_at desc)`
  await s`create index if not exists submissions_property_idx on submissions (property_id)`

  await s`create table if not exists properties (
    id text primary key,
    owner_email text,
    data jsonb not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`
  for (const col of [
    ['origin', 'text'],
    ['formatted_address', 'text'],
    ['street_number', 'text'],
    ['route', 'text'],
    ['unit', 'text'],
    ['city', 'text'],
    ['county', 'text'],
    ['state', 'text'],
    ['zip', 'text'],
    ['lat', 'double precision'],
    ['lng', 'double precision'],
    ['mapbox_id', 'text'],
    ['parcel_apn', 'text'],
    ['parcel_area_sqft', 'integer'],
    ['parcel', 'jsonb'],
    ['pois', 'jsonb'],
    ['facts', 'jsonb'],
    ['listing', 'jsonb'],
    ['lang', 'text'],
    ['share_views', 'integer not null default 0'],
    ['last_viewed_at', 'timestamptz'],
  ]) {
    // Column names come from the fixed list above, never from input.
    await s.query(`alter table properties add column if not exists ${col[0]} ${col[1]}`)
  }
  await s`create index if not exists properties_owner_idx on properties (owner_email)`

  await s`create table if not exists photos (
    property_id text not null,
    id text not null,
    email text,
    source text,
    source_url text,
    src text,
    width integer,
    height integer,
    caption text,
    credit text,
    position integer,
    hidden boolean not null default false,
    chosen_render_id text,
    created_at timestamptz not null default now(),
    primary key (property_id, id)
  )`

  await s`create table if not exists renders (
    id text primary key,
    property_id text,
    photo_id text,
    email text,
    mode text,
    style text,
    light text,
    feedback text,
    note text,
    model text,
    align real,
    attempts integer,
    ms integer,
    src text,
    width integer,
    height integer,
    lang text,
    created_at timestamptz not null default now()
  )`
  await s`create index if not exists renders_property_idx on renders (property_id, created_at)`

  await s`create table if not exists share_views (
    id bigserial primary key,
    property_id text not null,
    viewed_at timestamptz not null default now(),
    lang text,
    country text,
    referrer text,
    user_agent text
  )`
  await s`create index if not exists share_views_property_idx on share_views (property_id, viewed_at desc)`

  await s`create table if not exists images (
    id text primary key,
    property_id text,
    kind text,
    content_type text not null,
    bytes integer not null,
    data bytea not null,
    created_at timestamptz not null default now()
  )`

  // Placeholder for accounts (not wired yet). Kept here so the schema is ready.
  await s`create table if not exists users (
    id text primary key,
    email text unique not null,
    name text,
    created_at timestamptz not null default now()
  )`
}

async function ensure() {
  const s = db()
  if (!s) return null
  if (!ready) {
    ready = migrate(s).catch((e) => {
      ready = null
      throw e
    })
  }
  await ready
  return s
}

// Every write below except saveSnapshot is best-effort: a database hiccup is
// logged and never stops the visitor's lookup, upload or render.
async function safe(label, fn) {
  try {
    const s = await ensure()
    if (!s) return null
    return await fn(s)
  } catch (err) {
    console.error(`[db] ${label}`, err.message)
    return null
  }
}

export const dbEnabled = () => Boolean(config.databaseUrl)

export async function ping() {
  if (!config.databaseUrl) return 'off'
  try {
    const s = await ensure()
    await s`select 1`
    return 'ok'
  } catch (err) {
    console.error('[db] ping', err.message)
    return 'error'
  }
}

// Visitor details from Vercel's request headers (country/region only, no IP).
export function visitor(req) {
  const h = req?.headers || {}
  const dec = (v) => {
    try {
      return v ? decodeURIComponent(String(v)) : null
    } catch {
      return null
    }
  }
  return {
    country: dec(h['x-vercel-ip-country']),
    region: dec(h['x-vercel-ip-country-region']),
    userAgent: h['user-agent'] ? String(h['user-agent']).slice(0, 300) : null,
    referrer: h.referer ? String(h.referer).slice(0, 500) : null,
  }
}

export function captureLead({ email, lang = null, context = null, req = null }) {
  const v = visitor(req)
  return safe('captureLead', async (s) => {
    const e = email.trim().toLowerCase()
    await s`insert into leads (email, lang, submissions, country, region, user_agent, referrer, first_context)
      values (${e}, ${lang}, 0, ${v.country}, ${v.region}, ${v.userAgent}, ${v.referrer}, ${context})
      on conflict (email) do update set last_seen = now(),
        lang = coalesce(excluded.lang, leads.lang),
        country = coalesce(excluded.country, leads.country),
        region = coalesce(excluded.region, leads.region),
        user_agent = coalesce(excluded.user_agent, leads.user_agent)`
    await s`insert into submissions (email, kind, lang, meta) values (${e}, 'email_capture', ${lang}, ${j({ context, ...v })}::jsonb)`
    return true
  })
}

// Every submission (address search, listing lookup, photo upload, render, change
// request) is logged against the captured email.
export function logSubmission({ email, kind, address = null, propertyId = null, lang = null, meta = null }) {
  if (!email) return Promise.resolve(null)
  return safe('logSubmission', async (s) => {
    const e = email.trim().toLowerCase()
    await s`insert into leads (email, lang, submissions) values (${e}, ${lang}, 1)
      on conflict (email) do update set last_seen = now(), submissions = leads.submissions + 1, lang = coalesce(excluded.lang, leads.lang)`
    await s`insert into submissions (email, kind, address, property_id, lang, meta)
      values (${e}, ${kind}, ${address}, ${propertyId}, ${lang}, ${j(meta)}::jsonb)`
    return true
  })
}

// A home found by address (or located later in the own-photos flow). New rows get
// a full snapshot; existing rows keep their photos and gain the location.
export function upsertProperty(p, { email, origin = 'address', lang = null } = {}) {
  const a = p.address || {}
  const snapshot = { id: p.id, createdAt: p.createdAt, address: p.address, parcel: p.parcel, pois: p.pois, facts: p.facts ?? null, listing: p.listing ?? null, photos: p.photos || [] }
  const located = { address: p.address, parcel: p.parcel, pois: p.pois }
  return safe('upsertProperty', (s) => s`insert into properties (
      id, owner_email, data, origin, formatted_address, street_number, route, unit, city, county, state, zip,
      lat, lng, mapbox_id, parcel_apn, parcel_area_sqft, parcel, pois, lang)
    values (${p.id}, ${email || null}, ${j(snapshot)}::jsonb, ${origin}, ${a.formatted || null}, ${a.streetNumber || null}, ${a.route || null},
      ${a.unit || null}, ${a.city || null}, ${a.county || null}, ${a.state || null}, ${a.zip || null}, ${a.lat ?? null}, ${a.lng ?? null},
      ${a.placeId || null}, ${p.parcel?.apn || null}, ${p.parcel?.areaSqft ?? null}, ${j(p.parcel)}::jsonb, ${j(p.pois)}::jsonb, ${lang})
    on conflict (id) do update set
      owner_email = coalesce(properties.owner_email, excluded.owner_email),
      formatted_address = excluded.formatted_address, street_number = excluded.street_number, route = excluded.route,
      unit = excluded.unit, city = excluded.city, county = excluded.county, state = excluded.state, zip = excluded.zip,
      lat = excluded.lat, lng = excluded.lng, mapbox_id = excluded.mapbox_id, parcel_apn = excluded.parcel_apn,
      parcel_area_sqft = excluded.parcel_area_sqft, parcel = excluded.parcel, pois = excluded.pois,
      data = properties.data || ${j(located)}::jsonb, updated_at = now()`)
}

// An own-photos property exists before it has an address.
export function ensureProperty(id, { email, lang = null } = {}) {
  const snapshot = { id, createdAt: new Date().toISOString(), address: null, parcel: null, pois: [], facts: null, listing: null, photos: [] }
  return safe('ensureProperty', (s) => s`insert into properties (id, owner_email, data, origin, lang)
    values (${id}, ${email || null}, ${j(snapshot)}::jsonb, 'own', ${lang})
    on conflict (id) do nothing`)
}

const photoRow = (propertyId, ph, email, position) => [
  propertyId,
  ph.id,
  email || null,
  ph.source || null,
  ph.sourceUrl || null,
  ph.src || null,
  ph.width ?? null,
  ph.height ?? null,
  ph.caption || null,
  ph.credit || null,
  position ?? null,
]

async function insertPhotoRows(s, propertyId, photos, email, startAt = 0) {
  for (let i = 0; i < photos.length; i++) {
    const r = photoRow(propertyId, photos[i], email, startAt + i)
    await s`insert into photos (property_id, id, email, source, source_url, src, width, height, caption, credit, position)
      values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]}, ${r[8]}, ${r[9]}, ${r[10]})
      on conflict (property_id, id) do nothing`
  }
}

// What the listing lookup found: facts, links and photos — into their own columns
// and rows, and merged into the snapshot so a share link works straight away.
export function saveListing(propertyId, { facts, listing, photos, email }) {
  return safe('saveListing', async (s) => {
    await insertPhotoRows(s, propertyId, photos, email)
    const clean = photos.map(({ sourceUrl, ...ph }) => ph) // eslint-disable-line no-unused-vars
    await s`update properties set facts = ${j(facts)}::jsonb, listing = ${j(listing)}::jsonb,
      data = jsonb_set(
        data || jsonb_build_object('facts', ${j(facts)}::jsonb, 'listing', ${j(listing)}::jsonb, 'listingChecked', true),
        '{photos}',
        ${j(clean)}::jsonb || coalesce((select jsonb_agg(x) from jsonb_array_elements(data->'photos') x
          where x->>'source' not in ('zillow', 'redfin')), '[]'::jsonb)),
      updated_at = now()
      where id = ${propertyId}`
    return true
  })
}

export function addPhoto(propertyId, photo, { email }) {
  return safe('addPhoto', async (s) => {
    const n = await s`select count(*)::int as n from photos where property_id = ${propertyId}`
    await insertPhotoRows(s, propertyId, [photo], email, n[0]?.n || 0)
    await s`update properties set data = jsonb_set(data, '{photos}', coalesce(data->'photos', '[]'::jsonb) || ${j([photo])}::jsonb),
      updated_at = now() where id = ${propertyId}`
    return true
  })
}

export function saveRender(v, { propertyId, photoId, email, note = null, lang = null }) {
  return safe('saveRender', async (s) => {
    await s`insert into renders (id, property_id, photo_id, email, mode, style, light, feedback, note, model, align, attempts, ms, src, width, height, lang)
      values (${v.id}, ${propertyId}, ${photoId || null}, ${email || null}, ${v.mode}, ${v.style || null}, ${v.light || null},
        ${v.feedback || null}, ${note}, ${v.model || null}, ${v.align ?? null}, ${v.attempts ?? null}, ${v.ms ?? null},
        ${v.src}, ${v.width ?? null}, ${v.height ?? null}, ${lang})
      on conflict (id) do nothing`
    if (photoId) await s`update photos set chosen_render_id = ${v.id} where property_id = ${propertyId} and id = ${photoId}`
    return true
  })
}

// The studio's full snapshot (photo order, hidden photos, chosen versions). Only
// the owner (the email that created the property) may overwrite it.
export async function saveSnapshot(id, data, email) {
  const s = await ensure()
  if (!s) return { ok: false, reason: 'no_database' }
  const e = (email || '').trim().toLowerCase()
  const rows = await s`update properties set data = ${j(data)}::jsonb, updated_at = now(),
      owner_email = coalesce(owner_email, ${e})
    where id = ${id} and (owner_email is null or owner_email = ${e})
    returning id`
  if (!rows.length) {
    const exists = await s`select 1 from properties where id = ${id}`
    if (exists.length) return { ok: false, reason: 'not_owner' }
    await s`insert into properties (id, owner_email, data, origin) values (${id}, ${e}, ${j(data)}::jsonb, 'own') on conflict (id) do nothing`
  }
  for (const ph of data.photos || []) {
    await s`update photos set hidden = ${!!ph.hidden}, chosen_render_id = ${ph.chosen || null}
      where property_id = ${id} and id = ${ph.id}`
  }
  return { ok: true }
}

export async function loadProperty(id) {
  const s = await ensure()
  if (!s) return null
  const rows = await s`select data, updated_at, share_views from properties where id = ${id}`
  return rows[0] ? { ...rows[0].data, updatedAt: rows[0].updated_at, shareViews: rows[0].share_views } : null
}

export function recordView(id, { lang = null, req = null } = {}) {
  const v = visitor(req)
  return safe('recordView', async (s) => {
    await s`insert into share_views (property_id, lang, country, referrer, user_agent)
      values (${id}, ${lang}, ${v.country}, ${v.referrer}, ${v.userAgent})`
    await s`update properties set share_views = share_views + 1, last_viewed_at = now() where id = ${id}`
    return true
  })
}

// Image bytes, when Blob is not configured. Base64 over the wire keeps this
// independent of how the driver encodes bytea.
export async function putImage(id, buffer, { propertyId = null, kind = null, contentType = 'image/jpeg' } = {}) {
  const s = await ensure()
  if (!s) return false
  await s`insert into images (id, property_id, kind, content_type, bytes, data)
    values (${id}, ${propertyId}, ${kind}, ${contentType}, ${buffer.length}, decode(${buffer.toString('base64')}, 'base64'))`
  return true
}

export async function getImage(id) {
  const s = await ensure()
  if (!s) return null
  const rows = await s`select content_type, encode(data, 'base64') as b64 from images where id = ${id}`
  if (!rows[0]) return null
  return { contentType: rows[0].content_type, buffer: Buffer.from(rows[0].b64.replace(/\s/g, ''), 'base64') }
}

import { neon } from '@neondatabase/serverless'
import { config } from './config.js'
import { normalizeProperty } from '../../shared/model.js'

// Neon Postgres holds everything Sceneshare learns and makes:
//   users            one row per account (the account itself lives in Neon Auth's neon_auth schema)
//   leads            one row per email we know (account sign-ups and buyers who asked for updates)
//   submissions      every action a signed-in owner takes, with its details (the audit log)
//   properties       each home: owner, address, parcel, nearby places, facts, listing links,
//                    plus `data`, the full snapshot the studio and the buyer page are drawn from
//   photos           every photo of a home: listing or owner upload; source URL and our copy
//   designs          each "Restyle this house" run: style, light, progress
//   renders          every image the model made: design, settings, model, timing, alignment
//   share_views      each time a buyer opens a share link
//   images           image bytes, used when Vercel Blob is not set up (served by /api/media)
//   events           product analytics: page views and actions, first-party, no cookies
//   api_log          every API request: route, status, duration, user, error code
//   privacy_requests access / deletion / correction requests (CCPA)
// Tables are created and upgraded on first use, so a fresh Neon database needs no
// setup step and an older one gains new columns automatically.

let sql = null
let ready = null

function db() {
  if (!config.databaseUrl) return null
  if (!sql) sql = config.databaseUrl.startsWith('pglite:') ? pglite(config.databaseUrl) : neon(config.databaseUrl)
  return sql
}

// Local development without Neon: DATABASE_URL=pglite://memory (or pglite://./.data/db)
// runs the same SQL on an embedded Postgres. Never used in production.
function pglite(url) {
  let pg = null
  const get = async () => {
    if (!pg) {
      const name = '@electric-sql/pglite'
      const { PGlite } = await import(/* @vite-ignore */ name)
      const dir = url.replace(/^pglite:\/\//, '')
      pg = dir && dir !== 'memory' ? new PGlite(dir) : new PGlite()
    }
    return pg
  }
  const tagged = async (strings, ...vals) => (await (await get()).query(strings.reduce((acc, part, i) => acc + '$' + i + part), vals)).rows
  tagged.query = async (text, params = []) => (await (await get()).query(text, params)).rows
  return tagged
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
  for (const col of ['country text', 'region text', 'user_agent text', 'referrer text', 'first_context text', 'user_id text', 'source text']) {
    await s.query(`alter table leads add column if not exists ${col}`)
  }

  await s`create table if not exists submissions (
    id bigserial primary key,
    email text,
    kind text not null,
    address text,
    property_id text,
    lang text,
    meta jsonb,
    created_at timestamptz not null default now()
  )`
  await s`alter table submissions alter column email drop not null`
  await s`alter table submissions add column if not exists user_id text`
  await s`create index if not exists submissions_email_idx on submissions (email, created_at desc)`
  await s`create index if not exists submissions_property_idx on submissions (property_id)`
  await s`create index if not exists submissions_user_idx on submissions (user_id, created_at desc)`

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
    ['owner_user_id', 'text'],
    ['rev', 'integer not null default 0'],
  ]) {
    // Column names come from the fixed list above, never from input.
    await s.query(`alter table properties add column if not exists ${col[0]} ${col[1]}`)
  }
  await s`create index if not exists properties_owner_idx on properties (owner_email)`
  await s`create index if not exists properties_owner_user_idx on properties (owner_user_id, updated_at desc)`

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
  await s`alter table photos add column if not exists user_id text`

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
  for (const col of ['design_id text', 'user_id text', 'base_version_id text']) await s.query(`alter table renders add column if not exists ${col}`)
  await s`create index if not exists renders_property_idx on renders (property_id, created_at)`
  await s`create index if not exists renders_design_idx on renders (design_id)`

  await s`create table if not exists designs (
    id text primary key,
    property_id text not null,
    user_id text,
    mode text,
    style text,
    light text,
    note text,
    status text not null default 'running',
    photos integer not null default 0,
    done integer not null default 0,
    failed integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`
  await s`create index if not exists designs_property_idx on designs (property_id, created_at)`

  await s`create table if not exists share_views (
    id bigserial primary key,
    property_id text not null,
    viewed_at timestamptz not null default now(),
    lang text,
    country text,
    referrer text,
    user_agent text
  )`
  await s`alter table share_views add column if not exists visitor_id text`
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
  await s`create index if not exists images_property_idx on images (property_id)`

  await s`create table if not exists users (
    id text primary key,
    email text unique not null,
    name text,
    created_at timestamptz not null default now()
  )`
  await s`alter table users add column if not exists last_seen_at timestamptz`
  await s`alter table users add column if not exists email_verified boolean`
  await s`alter table users add column if not exists prefs jsonb`
  await s`alter table users drop constraint if exists users_email_key`
  // Terms of Service: accepted once per account before sharing (Chris, 2026-11-04).
  await s`alter table users add column if not exists terms_accepted_at timestamptz`
  await s`alter table users add column if not exists terms_version text`
  await s`create table if not exists terms_acceptances (
    id bigserial primary key,
    user_id text not null,
    email text,
    version text not null,
    at timestamptz not null default now(),
    ip_hash text,
    user_agent text,
    context text
  )`
  await s`create index if not exists terms_acceptances_user_idx on terms_acceptances (user_id, at desc)`
  // A buyer on a not-yet-visible home asking its sharer to accept the Terms.
  await s`create table if not exists terms_requests (
    id text primary key,
    at timestamptz not null default now(),
    property_id text not null,
    owner_user_id text,
    owner_email text,
    requester_email text,
    visitor_id text,
    ip_hash text,
    share_id text,
    emailed boolean not null default false
  )`
  await s`create index if not exists terms_requests_property_idx on terms_requests (property_id, at desc)`
  // Billing (see api/_lib/billing.js). One subscription per account.
  for (const col of ['plan text', 'plan_status text', 'plan_source text', 'plan_interval text', 'period_end timestamptz', 'cancel_at_period_end boolean', 'stripe_customer_id text', 'stripe_subscription_id text', 'plan_updated_at timestamptz', 'plan_addons int']) {
    await s.query(`alter table users add column if not exists ${col}`)
  }
  await s`create table if not exists billing_events (
    id text primary key,
    at timestamptz not null default now(),
    source text not null,
    type text not null,
    user_id text,
    data jsonb
  )`
  await s`create index if not exists billing_events_user_idx on billing_events (user_id, at desc)`
  // Render credits. One row per rendered image (delta -1, pool 'plan:<plan>' = the
  // monthly allotment, 'pack:<mode>' = bought credits, 'unmetered') and one per
  // credit pack bought (delta +n, mode preview|test|live|comp).
  await s`create table if not exists credit_ledger (
    id text primary key,
    user_id text not null,
    at timestamptz not null default now(),
    delta int not null,
    kind text not null,
    pool text,
    mode text,
    ref text,
    data jsonb
  )`
  await s`create index if not exists credit_ledger_user_idx on credit_ledger (user_id, at desc)`
  // Extras (Premium): each adds property slots for a time; its credits go into credit_ledger.
  await s`create table if not exists extras (
    id text primary key,
    user_id text not null,
    at timestamptz not null default now(),
    expires_at timestamptz not null,
    homes int not null,
    credits int not null,
    mode text not null,
    ref text
  )`
  await s`create index if not exists extras_user_idx on extras (user_id, expires_at desc)`

  // Every error, wherever it happened, for review on /admin: the server's own
  // failures (any 4xx/5xx), failed requests as the browser saw them, and browser crashes.
  await s`create table if not exists error_log (
    id bigserial primary key,
    at timestamptz not null default now(),
    source text not null,
    level text not null default 'error',
    method text,
    route text,
    path text,
    page text,
    status integer,
    code text,
    message text,
    detail text,
    user_id text,
    visitor_id text,
    request_id text,
    ip_hash text,
    country text,
    device text,
    lang text,
    shown text,
    reviewed_at timestamptz
  )`
  await s`create index if not exists error_log_at_idx on error_log (at desc)`
  await s`create index if not exists error_log_open_idx on error_log (reviewed_at, at desc)`

  await s`create table if not exists events (
    id bigserial primary key,
    at timestamptz not null default now(),
    name text not null,
    path text,
    property_id text,
    visitor_id text,
    session_id text,
    user_id text,
    lang text,
    country text,
    region text,
    device text,
    referrer text,
    props jsonb
  )`
  await s`create index if not exists events_at_idx on events (at desc)`
  await s`create index if not exists events_name_idx on events (name, at desc)`
  await s`create index if not exists events_property_idx on events (property_id, at desc)`

  await s`create table if not exists api_log (
    id bigserial primary key,
    at timestamptz not null default now(),
    method text,
    route text,
    status integer,
    ms integer,
    user_id text,
    ip_hash text,
    visitor_id text,
    country text,
    code text,
    meta jsonb
  )`
  await s`create index if not exists api_log_at_idx on api_log (at desc)`
  await s`create index if not exists api_log_ip_idx on api_log (ip_hash, route, at desc)`
  await s`create index if not exists api_log_user_idx on api_log (user_id, route, at desc)`

  await s`create table if not exists shares (
    id text primary key,
    property_id text not null,
    user_id text,
    by_owner boolean not null default false,
    channel text not null,
    recipients jsonb,
    recipient_count integer not null default 0,
    sender_name text,
    message text,
    lang text,
    visitor_id text,
    sent boolean not null default false,
    opens integer not null default 0,
    last_opened_at timestamptz,
    created_at timestamptz not null default now()
  )`
  await s`create index if not exists shares_property_idx on shares (property_id, created_at desc)`
  await s`alter table share_views add column if not exists share_id text`
  await s`alter table shares add column if not exists tracked boolean not null default true`

  await s`create table if not exists privacy_requests (
    id text primary key,
    at timestamptz not null default now(),
    kind text not null,
    email text not null,
    user_id text,
    details text,
    status text not null default 'open',
    resolved_at timestamptz,
    meta jsonb
  )`
}

// Bump when migrate() changes. A cold start then costs one query, not sixty.
const SCHEMA_VERSION = 11

async function upToDate(s) {
  try {
    const rows = await s`select value from schema_meta where key = 'version'`
    return Number(rows[0]?.value) === SCHEMA_VERSION
  } catch {
    return false // table not created yet
  }
}

export async function ensure() {
  const s = db()
  if (!s) return null
  if (!ready) {
    ready = (async () => {
      if (await upToDate(s)) return
      await migrate(s)
      await s`create table if not exists schema_meta (key text primary key, value text not null)`
      await s`insert into schema_meta (key, value) values ('version', ${String(SCHEMA_VERSION)})
        on conflict (key) do update set value = excluded.value`
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  await ready
  return s
}

// Best-effort writes: a database hiccup is logged and never stops the visitor.
async function safe(label, fn) {
  try {
    const s = await ensure()
    if (!s) return null
    return await fn(s)
  } catch (err) {
    console.error(JSON.stringify({ t: 'db', label, err: String(err.message).slice(0, 300) }))
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
    console.error(JSON.stringify({ t: 'db', label: 'ping', err: err.message }))
    return 'error'
  }
}

// Visitor details from Vercel's request headers (country/region only, never the IP).
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

// ---------------------------------------------------------------- people

export function captureLead({ email, lang = null, context = null, source = null, propertyId = null, userId = null, req = null }) {
  const v = visitor(req)
  return safe('captureLead', async (s) => {
    const e = email.trim().toLowerCase()
    await s`insert into leads (email, lang, submissions, country, region, user_agent, referrer, first_context, user_id, source)
      values (${e}, ${lang}, 0, ${v.country}, ${v.region}, ${v.userAgent}, ${v.referrer}, ${context}, ${userId}, ${source})
      on conflict (email) do update set last_seen = now(),
        lang = coalesce(excluded.lang, leads.lang),
        country = coalesce(excluded.country, leads.country),
        region = coalesce(excluded.region, leads.region),
        user_agent = coalesce(excluded.user_agent, leads.user_agent),
        user_id = coalesce(excluded.user_id, leads.user_id)`
    await s`insert into submissions (email, user_id, kind, property_id, lang, meta)
      values (${e}, ${userId}, 'email_capture', ${propertyId}, ${lang}, ${j({ context, source, ...v })}::jsonb)`
    return true
  })
}

// Seen a signed-in user: keep the users row current, and on first sight move any
// homes saved under their (verified) email before accounts existed into the account.
export async function touchUser(user) {
  const r = await safe('touchUser', async (s) => {
    await s`insert into users (id, email, name, email_verified, last_seen_at) values (${user.id}, ${user.email}, ${user.name || null}, ${user.emailVerified}, now())
      on conflict (id) do update set email = excluded.email, name = coalesce(excluded.name, users.name),
        email_verified = excluded.email_verified, last_seen_at = now()`
    await s`insert into leads (email, user_id, source, submissions) values (${user.email}, ${user.id}, 'account', 0)
      on conflict (email) do update set user_id = excluded.user_id, last_seen = now()`
    const [row] = await s`select prefs, terms_accepted_at, terms_version from users where id = ${user.id}`
    let claimed = 0
    if (user.emailVerified && user.email) {
      const rows = await s`update properties set owner_user_id = ${user.id}, updated_at = now()
        where owner_user_id is null and lower(owner_email) = ${user.email} returning id`
      claimed = rows.length
    }
    return { claimed, prefs: row?.prefs || {}, termsAt: row?.terms_accepted_at || null, termsVersion: row?.terms_version || null }
  })
  return r || { claimed: 0, prefs: {} }
}

const PREF_KEYS = { lang: ['en', 'zh'], linkLang: ['en', 'zh'], productEmails: [true, false], activityEmails: [true, false] }
export async function setPrefs(userId, patch) {
  const s = await ensure()
  if (!s) return {}
  const clean = Object.fromEntries(Object.entries(patch || {}).filter(([k, v]) => PREF_KEYS[k]?.includes(v)))
  const rows = await s`update users set prefs = coalesce(prefs, '{}'::jsonb) || ${j(clean)}::jsonb where id = ${userId} returning prefs`
  return rows[0]?.prefs || {}
}

// Every owner action (address search, listing lookup, upload, render, change
// request, share) is logged against the account.
export function logSubmission({ user = null, email = null, kind, address = null, propertyId = null, lang = null, meta = null }) {
  const e = (user?.email || email || '').trim().toLowerCase() || null
  return safe('logSubmission', async (s) => {
    if (e) {
      await s`insert into leads (email, lang, submissions, user_id) values (${e}, ${lang}, 1, ${user?.id || null})
        on conflict (email) do update set last_seen = now(), submissions = leads.submissions + 1, lang = coalesce(excluded.lang, leads.lang)`
    }
    await s`insert into submissions (email, user_id, kind, address, property_id, lang, meta)
      values (${e}, ${user?.id || null}, ${kind}, ${address}, ${propertyId}, ${lang}, ${j(meta)}::jsonb)`
    return true
  })
}

// ---------------------------------------------------------------- properties

// A home found by address. The searching account owns it.
export async function upsertProperty(p, { user, origin = 'address', lang = null }) {
  const s = await ensure()
  if (!s) return { ok: true }
  const a = p.address || {}
  const snapshot = { id: p.id, createdAt: p.createdAt, address: p.address, parcel: p.parcel, pois: p.pois, facts: p.facts ?? null, listing: p.listing ?? null, photos: p.photos || [], designs: [] }
  const located = { address: p.address, parcel: p.parcel, pois: p.pois, listingChecked: false }
  const rows = await s`insert into properties (
      id, owner_email, owner_user_id, data, origin, formatted_address, street_number, route, unit, city, county, state, zip,
      lat, lng, mapbox_id, parcel_apn, parcel_area_sqft, parcel, pois, lang)
    values (${p.id}, ${user.email}, ${user.id}, ${j(snapshot)}::jsonb, ${origin}, ${a.formatted || null}, ${a.streetNumber || null}, ${a.route || null},
      ${a.unit || null}, ${a.city || null}, ${a.county || null}, ${a.state || null}, ${a.zip || null}, ${a.lat ?? null}, ${a.lng ?? null},
      ${a.placeId || null}, ${p.parcel?.apn || null}, ${p.parcel?.areaSqft ?? null}, ${j(p.parcel)}::jsonb, ${j(p.pois)}::jsonb, ${lang})
    on conflict (id) do update set
      formatted_address = excluded.formatted_address, street_number = excluded.street_number, route = excluded.route,
      unit = excluded.unit, city = excluded.city, county = excluded.county, state = excluded.state, zip = excluded.zip,
      lat = excluded.lat, lng = excluded.lng, mapbox_id = excluded.mapbox_id, parcel_apn = excluded.parcel_apn,
      parcel_area_sqft = excluded.parcel_area_sqft, parcel = excluded.parcel, pois = excluded.pois,
      data = properties.data || ${j(located)}::jsonb, rev = properties.rev + 1, updated_at = now()
    where properties.owner_user_id = ${user.id}
    returning id`
  return { ok: rows.length > 0 }
}

// An own-photos home exists before it has an address.
export async function createOwnProperty(id, { user, lang = null }) {
  const s = await ensure()
  if (!s) return
  const snapshot = { id, createdAt: new Date().toISOString(), address: null, parcel: null, pois: [], facts: null, listing: null, listingChecked: true, photos: [], designs: [] }
  await s`insert into properties (id, owner_email, owner_user_id, data, origin, lang)
    values (${id}, ${user.email}, ${user.id}, ${j(snapshot)}::jsonb, 'own', ${lang})
    on conflict (id) do nothing`
}

export async function propertyRow(id) {
  const s = await ensure()
  if (!s) return null
  const rows = await s`select p.id, p.owner_user_id, p.owner_email, p.rev, p.data, p.share_views, p.updated_at,
      u.terms_accepted_at as owner_terms_at, u.terms_version as owner_terms_version, u.name as owner_name, u.email as owner_account_email
    from properties p left join users u on u.id = p.owner_user_id where p.id = ${id}`
  return rows[0] || null
}

// Read–modify–write of a home's snapshot with optimistic concurrency, so three
// renders finishing at once never overwrite each other. `fn` gets a normalized copy
// and returns the next snapshot (or false for "no change").
export async function mutateProperty(id, fn) {
  const s = await ensure()
  if (!s) return null
  for (let attempt = 0; attempt < 10; attempt++) {
    const rows = await s`select data, rev from properties where id = ${id}`
    if (!rows[0]) return null
    const current = normalizeProperty(rows[0].data)
    const next = await fn(current)
    if (next === false) return current
    const up = await s`update properties set data = ${j(next)}::jsonb, rev = rev + 1, updated_at = now()
      where id = ${id} and rev = ${rows[0].rev} returning rev`
    if (up.length) return next
    await new Promise((r) => setTimeout(r, 25 * 2 ** Math.min(attempt, 5) + Math.random() * 40))
  }
  throw new Error('property_busy')
}

export async function loadProperty(id) {
  const row = await propertyRow(id)
  if (!row) return null
  return { ...normalizeProperty(row.data), updatedAt: row.updated_at, shareViews: row.share_views }
}

export async function listProperties(userId) {
  const s = await ensure()
  if (!s) return []
  const rows = await s`select id, formatted_address, city, state, zip, origin, share_views, created_at, updated_at,
      jsonb_array_length(coalesce(data->'photos', '[]'::jsonb)) as photos,
      jsonb_array_length(coalesce(data->'designs', '[]'::jsonb)) as designs,
      data->'photos'->0->>'src' as cover, data->'address'->>'streetNumber' as street_number, data->'address'->>'route' as route,
      data->'address'->>'unit' as unit, data->>'nickname' as nickname,
      (select count(*)::int from shares sh where sh.property_id = properties.id) as shares
    from properties where owner_user_id = ${userId} order by updated_at desc limit 200`
  return rows
}

export async function deleteProperty(id) {
  const s = await ensure()
  if (!s) return
  await s`delete from images where property_id = ${id}`
  await s`delete from photos where property_id = ${id}`
  await s`delete from renders where property_id = ${id}`
  await s`delete from designs where property_id = ${id}`
  await s`delete from share_views where property_id = ${id}`
  await s`delete from shares where property_id = ${id}`
  await s`delete from properties where id = ${id}`
}

export function recordView(id, { lang = null, req = null, visitorId = null, shareId = null } = {}) {
  const v = visitor(req)
  return safe('recordView', async (s) => {
    let share = null
    if (shareId) {
      const rows = await s`update shares set opens = opens + 1, last_opened_at = now() where id = ${shareId} and property_id = ${id} and tracked returning id`
      share = rows[0]?.id || null
    }
    await s`insert into share_views (property_id, lang, country, referrer, user_agent, visitor_id, share_id)
      values (${id}, ${lang}, ${v.country}, ${v.referrer}, ${v.userAgent}, ${visitorId}, ${share})`
    await s`update properties set share_views = share_views + 1, last_viewed_at = now() where id = ${id}`
    return true
  })
}

// ---------------------------------------------------------------- shares

export async function createShare(sh) {
  const s = await ensure()
  if (!s) return false
  await s`insert into shares (id, property_id, user_id, by_owner, channel, recipients, recipient_count, sender_name, message, lang, visitor_id, sent, tracked)
    values (${sh.id}, ${sh.propertyId}, ${sh.userId}, ${sh.byOwner}, ${sh.channel}, ${j(sh.recipients)}::jsonb, ${sh.recipients?.length || 0},
      ${sh.senderName}, ${sh.message}, ${sh.lang}, ${sh.visitorId}, ${sh.sent}, ${sh.tracked !== false})`
  return true
}

export function markShareSent(id) {
  return safe('markShareSent', (s) => s`update shares set sent = true where id = ${id}`)
}

export async function listShares(propertyId) {
  const s = await ensure()
  if (!s) return { shares: [], totals: null }
  const shares = await s`select id, channel, by_owner, recipients, recipient_count, sender_name, lang, sent, tracked, opens, last_opened_at, created_at
    from shares where property_id = ${propertyId} order by created_at desc limit 200`
  const [totals] = await s`select count(*)::int as shares, coalesce(sum(recipient_count), 0)::int as recipients,
      coalesce(sum(opens), 0)::int as opens, count(*) filter (where channel = 'email')::int as emails
    from shares where property_id = ${propertyId}`
  const [views] = await s`select share_views as views from properties where id = ${propertyId}`
  return { shares, totals: { ...totals, views: views?.views || 0 } }
}

// ---------------------------------------------------------------- engagement (lib/engagement.js)

// For the owner: how long buyers spend on this home's share page and on what.
// The owner's own visits are left out.
export async function propertyEngagement(propertyId, ownerUserId = null) {
  const s = await ensure()
  if (!s) return null
  const owner = ownerUserId || ''
  const [v] = await s`with x as (
      select session_id, sum((props->>'activeMs')::bigint) as ms from events
      where name = 'engagement' and property_id = ${propertyId} and props->>'kind' = 'share' and coalesce(user_id, '') <> ${owner} and session_id is not null
      group by session_id)
    select count(*)::int as visits, coalesce(round(avg(ms)), 0)::bigint as avg_ms,
      coalesce(round(percentile_cont(0.5) within group (order by ms)), 0)::bigint as median_ms, coalesce(sum(ms), 0)::bigint as total_ms from x`
  const sections = await s`select kv.key as section, sum(kv.value::bigint)::bigint as ms
    from events, jsonb_each_text(coalesce(props->'sections', '{}'::jsonb)) kv
    where name = 'engagement' and property_id = ${propertyId} and props->>'kind' = 'share' and coalesce(user_id, '') <> ${owner}
    group by 1 order by 2 desc`
  const rooms = await s`select kv.key as photo, sum(kv.value::bigint)::bigint as ms
    from events, jsonb_each_text(coalesce(props->'rooms', '{}'::jsonb)) kv
    where name = 'engagement' and property_id = ${propertyId} and props->>'kind' = 'share' and coalesce(user_id, '') <> ${owner}
    group by 1 order by 2 desc limit 12`
  const num = (x) => Number(x || 0)
  return {
    visits: v?.visits || 0,
    avgMs: num(v?.avg_ms),
    medianMs: num(v?.median_ms),
    totalMs: num(v?.total_ms),
    sections: sections.map((r) => ({ section: r.section, ms: num(r.ms) })),
    rooms: rooms.map((r) => ({ photoId: r.photo, ms: num(r.ms) })),
  }
}

// For /admin: session length and where time goes, last N days.
export async function siteEngagement(days = 7) {
  const s = await ensure()
  if (!s) return null
  const since = new Date(Date.now() - days * 864e5).toISOString()
  const [sess] = await s`with x as (
      select session_id, min(at) as first_at, max(at) as last_at,
        count(*) filter (where name = 'page_view') as pages,
        coalesce(sum((props->>'activeMs')::bigint) filter (where name = 'engagement'), 0) as engaged
      from events where at > ${since} and session_id is not null group by session_id)
    select count(*)::int as sessions,
      coalesce(round(avg(engaged)), 0)::bigint as avg_engaged,
      coalesce(round(percentile_cont(0.5) within group (order by engaged)), 0)::bigint as median_engaged,
      coalesce(round(avg(extract(epoch from (last_at - first_at)) * 1000)), 0)::bigint as avg_span,
      coalesce(round(avg(pages)::numeric, 1), 0)::float as avg_pages,
      count(*) filter (where engaged >= 60000)::int as over_minute
    from x where pages > 0`
  const pages = await s`select coalesce(props->>'kind', 'other') as page, count(distinct session_id)::int as sessions,
      sum((props->>'activeMs')::bigint)::bigint as ms
    from events where name = 'engagement' and at > ${since} group by 1 order by 3 desc`
  const sections = await s`select coalesce(props->>'kind', 'other') as page, kv.key as section,
      sum(kv.value::bigint)::bigint as ms, count(distinct session_id)::int as sessions
    from events, jsonb_each_text(coalesce(props->'sections', '{}'::jsonb)) kv
    where name = 'engagement' and at > ${since} group by 1, 2 order by 1, 3 desc`
  const num = (x) => Number(x || 0)
  return {
    days,
    sessions: sess?.sessions || 0,
    avgEngagedMs: num(sess?.avg_engaged),
    medianEngagedMs: num(sess?.median_engaged),
    avgSpanMs: num(sess?.avg_span),
    avgPages: Number(sess?.avg_pages || 0),
    overMinute: sess?.over_minute || 0,
    pages: pages.map((r) => ({ page: r.page, sessions: r.sessions, ms: num(r.ms), avgMs: r.sessions ? Math.round(num(r.ms) / r.sessions) : 0 })),
    sections: sections.map((r) => ({ page: r.page, section: r.section, ms: num(r.ms), sessions: r.sessions })),
  }
}

// ---------------------------------------------------------------- photos, designs, renders

const photoRow = (propertyId, ph, user, position) => [
  propertyId,
  ph.id,
  user?.email || null,
  ph.source || null,
  ph.sourceUrl || null,
  ph.src || null,
  ph.width ?? null,
  ph.height ?? null,
  ph.caption || null,
  ph.credit || null,
  position ?? null,
  user?.id || null,
]

export async function insertPhotoRows(propertyId, photos, user, startAt = 0) {
  return safe('insertPhotoRows', async (s) => {
    for (let i = 0; i < photos.length; i++) {
      const r = photoRow(propertyId, photos[i], user, startAt + i)
      await s`insert into photos (property_id, id, email, source, source_url, src, width, height, caption, credit, position, user_id)
        values (${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, ${r[5]}, ${r[6]}, ${r[7]}, ${r[8]}, ${r[9]}, ${r[10]}, ${r[11]})
        on conflict (property_id, id) do nothing`
    }
    return true
  })
}

export async function setPropertyColumns(id, { facts, listing }) {
  return safe('setPropertyColumns', (s) => s`update properties set facts = ${j(facts)}::jsonb, listing = ${j(listing)}::jsonb where id = ${id}`)
}

export function upsertDesign(d, { propertyId, user }) {
  return safe('upsertDesign', (s) => s`insert into designs (id, property_id, user_id, mode, style, light, note, status, photos, done, failed)
    values (${d.id}, ${propertyId}, ${user?.id || null}, ${d.mode}, ${d.style || null}, ${d.light || null}, ${d.note || null},
      ${d.status || 'running'}, ${d.total || 0}, ${Object.keys(d.picks || {}).length}, ${(d.failed || []).length})
    on conflict (id) do update set status = excluded.status, photos = excluded.photos, done = excluded.done,
      failed = excluded.failed, updated_at = now()`)
}

export function saveRender(v, { propertyId, photoId, user, note = null, lang = null }) {
  return safe('saveRender', async (s) => {
    await s`insert into renders (id, property_id, photo_id, email, user_id, design_id, base_version_id, mode, style, light, feedback, note, model, align, attempts, ms, src, width, height, lang)
      values (${v.id}, ${propertyId}, ${photoId || null}, ${user?.email || null}, ${user?.id || null}, ${v.designId || null}, ${v.baseVersionId || null},
        ${v.mode}, ${v.style || null}, ${v.light || null}, ${v.feedback || null}, ${note}, ${v.model || null}, ${v.align ?? null},
        ${v.attempts ?? null}, ${v.ms ?? null}, ${v.src}, ${v.width ?? null}, ${v.height ?? null}, ${lang})
      on conflict (id) do nothing`
    if (photoId) await s`update photos set chosen_render_id = ${v.id} where property_id = ${propertyId} and id = ${photoId}`
    return true
  })
}

export function setPhotoHidden(propertyId, photoId, hidden) {
  return safe('setPhotoHidden', (s) => s`update photos set hidden = ${hidden} where property_id = ${propertyId} and id = ${photoId}`)
}

// ---------------------------------------------------------------- images

// Image bytes, when Blob is not configured. Base64 over the wire keeps this
// independent of how the driver encodes bytea.
export async function putImage(id, buffer, { propertyId = null, kind = null, contentType = 'image/jpeg' } = {}) {
  const s = await ensure()
  if (!s) return false
  await s`insert into images (id, property_id, kind, content_type, bytes, data)
    values (${id}, ${propertyId}, ${kind}, ${contentType}, ${buffer.length}, decode(${buffer.toString('base64')}, 'base64'))`
  return true
}

export async function deleteImages(ids) {
  const s = await ensure()
  if (!s || !ids.length) return 0
  const rows = await s`delete from images where id = any(${ids}) returning id`
  return rows.length
}

// A deleted round of images: its design row and render log go with it.
export async function deleteDesignRows(propertyId, designId) {
  const s = await ensure()
  if (!s) return
  await s`delete from renders where property_id = ${propertyId} and design_id = ${designId}`
  await s`delete from designs where property_id = ${propertyId} and id = ${designId}`
}

// ---------------------------------------------------------------- analytics dashboard (/admin → Analytics)
// Daily series, period totals vs the period before, the owner funnel, and where
// visitors come from. Days are Pacific time. Visitors and sessions only exist for
// people who allowed analytics; page views are counted for everyone.
export async function adminAnalytics(days = 30) {
  const s = await ensure()
  if (!s) return null
  const n = Math.min(365, Math.max(1, Math.round(days)))
  const tz = 'America/Los_Angeles'
  const end = new Date()
  const start = new Date(end.getTime() - n * 864e5)
  const prev = new Date(start.getTime() - n * 864e5)
  const num = (x) => Number(x || 0)

  // One row per day per metric, from each source table.
  const daily = await s`with d as (
      select generate_series((${start.toISOString()}::timestamptz at time zone ${tz})::date, (${end.toISOString()}::timestamptz at time zone ${tz})::date, interval '1 day')::date as day),
    ev as (select (at at time zone ${tz})::date as day,
        count(*) filter (where name = 'page_view') as page_views,
        count(distinct visitor_id) filter (where name = 'page_view') as visitors,
        count(distinct session_id) filter (where name = 'page_view') as sessions,
        count(*) filter (where name = 'address_search') as searches,
        count(*) filter (where name = 'house_restyle_start' or name = 'photo_restyle_start') as restyles,
        count(*) filter (where name like 'share%' and name not in ('share_email_open')) as shares_clicked
      from events where at > ${start.toISOString()} group by 1),
    u as (select (created_at at time zone ${tz})::date as day, count(*) as signups from users where created_at > ${start.toISOString()} group by 1),
    p as (select (created_at at time zone ${tz})::date as day, count(*) as homes from properties where created_at > ${start.toISOString()} group by 1),
    r as (select (created_at at time zone ${tz})::date as day, count(*) as renders from renders where created_at > ${start.toISOString()} group by 1),
    sh as (select (created_at at time zone ${tz})::date as day, count(*) as shares from shares where created_at > ${start.toISOString()} group by 1),
    bv as (select (viewed_at at time zone ${tz})::date as day, count(*) as buyer_views, count(distinct visitor_id) as buyers from share_views where viewed_at > ${start.toISOString()} group by 1),
    l as (select (first_seen at time zone ${tz})::date as day, count(*) as leads from leads where first_seen > ${start.toISOString()} group by 1)
    select d.day, coalesce(ev.page_views, 0)::int as page_views, coalesce(ev.visitors, 0)::int as visitors, coalesce(ev.sessions, 0)::int as sessions,
      coalesce(ev.searches, 0)::int as searches, coalesce(ev.restyles, 0)::int as restyles, coalesce(u.signups, 0)::int as signups,
      coalesce(p.homes, 0)::int as homes, coalesce(r.renders, 0)::int as renders, coalesce(sh.shares, 0)::int as shares,
      coalesce(bv.buyer_views, 0)::int as buyer_views, coalesce(l.leads, 0)::int as leads
    from d left join ev using (day) left join u using (day) left join p using (day) left join r using (day) left join sh using (day) left join bv using (day) left join l using (day)
    order by d.day`

  const totalsFor = async (from, to) => {
    const [t] = await s`select
        (select count(*) from events where name = 'page_view' and at > ${from} and at <= ${to})::int as page_views,
        (select count(distinct visitor_id) from events where name = 'page_view' and at > ${from} and at <= ${to})::int as visitors,
        (select count(distinct session_id) from events where name = 'page_view' and at > ${from} and at <= ${to})::int as sessions,
        (select count(*) from users where created_at > ${from} and created_at <= ${to})::int as signups,
        (select count(*) from properties where created_at > ${from} and created_at <= ${to})::int as homes,
        (select count(*) from renders where created_at > ${from} and created_at <= ${to})::int as renders,
        (select count(*) from shares where created_at > ${from} and created_at <= ${to})::int as shares,
        (select count(*) from share_views where viewed_at > ${from} and viewed_at <= ${to})::int as buyer_views,
        (select count(*) from leads where first_seen > ${from} and first_seen <= ${to})::int as leads,
        (select coalesce(round(avg(ms)), 0) from (select session_id, sum((props->>'activeMs')::bigint) as ms from events where name = 'engagement' and session_id is not null and at > ${from} and at <= ${to} group by 1) x)::bigint as avg_engaged_ms`
    return Object.fromEntries(Object.entries(t || {}).map(([k, v]) => [k, num(v)]))
  }
  const totals = await totalsFor(start.toISOString(), end.toISOString())
  const previous = await totalsFor(prev.toISOString(), start.toISOString())

  // Owner funnel, by session (analytics-consenting visitors): visited → searched an
  // address → opened the studio → started a restyle → shared.
  const [f] = await s`with x as (select session_id,
        bool_or(name = 'page_view') as visited,
        bool_or(name in ('address_search_start', 'address_search')) as searched,
        bool_or(name = 'page_view' and path like '/studio/%') as studio,
        bool_or(name in ('house_restyle_start', 'photo_restyle_start')) as restyled,
        bool_or(name in ('share_email', 'share_copy', 'share_text', 'share_native')) as shared
      from events where at > ${start.toISOString()} and session_id is not null group by 1)
    select count(*) filter (where visited)::int as visited, count(*) filter (where searched)::int as searched, count(*) filter (where studio)::int as studio,
      count(*) filter (where restyled)::int as restyled, count(*) filter (where shared)::int as shared from x`

  const since = start.toISOString()
  const pages = await s`select case when path ~ '^/p/' then '/p/:home' when path ~ '^/studio/' then '/studio/:home' else coalesce(path, '/') end as page,
      count(*)::int as n, count(distinct visitor_id)::int as visitors from events where name = 'page_view' and at > ${since} group by 1 order by 2 desc limit 12`
  const referrers = await s`select coalesce(nullif(substring(referrer from '^https?://(?:www[.])?([^/:?#]+)'), ''), 'Direct / none') as source, count(*)::int as n
    from events where name = 'page_view' and at > ${since} and (referrer is null or referrer not like '%sceneshare.app%') group by 1 order by 2 desc limit 10`
  const countries = await s`select coalesce(country, '—') as country, count(*)::int as n from events where name = 'page_view' and at > ${since} group by 1 order by 2 desc limit 10`
  const devices = await s`select coalesce(device, '—') as device, count(*)::int as n from events where name = 'page_view' and at > ${since} group by 1 order by 2 desc`
  const languages = await s`select coalesce(lang, '—') as lang, count(*)::int as n from events where name = 'page_view' and at > ${since} group by 1 order by 2 desc`
  const actions = await s`select name, count(*)::int as n, count(distinct coalesce(session_id, visitor_id))::int as people from events
    where at > ${since} and name not in ('page_view', 'engagement', 'csp_violation', 'consent', 'client_error') group by 1 order by 2 desc limit 25`
  const homes = await s`select p.id, coalesce(p.data->>'nickname', p.formatted_address, 'Untitled home') as name, count(v.*)::int as views, count(distinct v.visitor_id)::int as buyers, max(v.viewed_at) as last_at
    from share_views v join properties p on p.id = v.property_id where v.viewed_at > ${since} group by 1, 2 order by 3 desc limit 10`
  const renderStats = await s`select count(*)::int as n, coalesce(round(avg(ms)), 0)::int as avg_ms, coalesce(round(percentile_cont(0.9) within group (order by ms)), 0)::int as p90_ms,
      count(*) filter (where feedback is not null)::int as changes from renders where created_at > ${since}`

  return {
    days: n,
    start: since,
    end: end.toISOString(),
    daily: daily.map((r) => ({ ...r, day: new Date(r.day).toISOString().slice(0, 10) })),
    totals,
    previous,
    funnel: f || {},
    pages,
    referrers,
    countries,
    devices,
    languages,
    actions,
    homes,
    renders: renderStats[0] || {},
  }
}

// ---------------------------------------------------------------- super admin: users and growth
// Activity here is the server's own record (api_log, by account), so it counts every
// signed-in user whatever their analytics choice.
export async function superUsers(days = 30) {
  const s = await ensure()
  if (!s) return null
  const n = Math.min(365, Math.max(1, Math.round(days)))
  const tz = 'America/Los_Angeles'
  const start = new Date(Date.now() - n * 864e5).toISOString()
  const num = (x) => Number(x || 0)

  const users = await s`with h as (select owner_user_id as uid, count(*) as homes, coalesce(sum(share_views), 0) as buyer_views, max(created_at) as last_home from properties where owner_user_id is not null group by 1),
      r as (select user_id as uid, count(*) as renders, count(*) filter (where created_at > ${start}) as renders_period, count(*) filter (where feedback is not null) as changes from renders where user_id is not null group by 1),
      sh as (select user_id as uid, count(*) as shares, coalesce(sum(opens), 0) as opens from shares where user_id is not null and by_owner group by 1),
      a as (select user_id as uid, count(*) filter (where at > ${start}) as requests, count(distinct (at at time zone ${tz})::date) filter (where at > ${start}) as active_days, max(at) as last_active from api_log where user_id is not null group by 1),
      c as (select user_id as uid, coalesce(-sum(delta) filter (where delta < 0), 0) as credits_used, coalesce(-sum(delta) filter (where delta < 0 and at > ${start}), 0) as credits_used_period from credit_ledger group by 1)
    select u.id, u.email, u.name, u.email_verified, u.created_at, u.last_seen_at, coalesce(u.plan, 'trial') as plan, u.plan_status, u.plan_source, u.plan_interval,
      coalesce(h.homes, 0)::int as homes, coalesce(h.buyer_views, 0)::int as buyer_views, coalesce(r.renders, 0)::int as renders, coalesce(r.renders_period, 0)::int as renders_period,
      coalesce(r.changes, 0)::int as changes, coalesce(sh.shares, 0)::int as shares, coalesce(sh.opens, 0)::int as opens, coalesce(a.requests, 0)::int as requests,
      coalesce(a.active_days, 0)::int as active_days, greatest(a.last_active, u.last_seen_at) as last_active, coalesce(c.credits_used, 0)::int as credits_used, coalesce(c.credits_used_period, 0)::int as credits_used_period
    from users u left join h on h.uid = u.id left join r on r.uid = u.id left join sh on sh.uid = u.id left join a on a.uid = u.id left join c on c.uid = u.id
    order by greatest(a.last_active, u.last_seen_at) desc nulls last, u.created_at desc limit 500`

  // Growth, by day: new accounts, accounts total, and active accounts (any request that day).
  const growth = await s`with d as (select generate_series(((now() - ${n + ' days'}::interval) at time zone ${tz})::date, (now() at time zone ${tz})::date, interval '1 day')::date as day),
      su as (select (created_at at time zone ${tz})::date as day, count(*) as n from users group by 1),
      act as (select (at at time zone ${tz})::date as day, count(distinct user_id) as n from api_log where user_id is not null and at > now() - ${n + 1 + ' days'}::interval group by 1)
    select d.day, coalesce(su.n, 0)::int as signups, (select count(*) from users where (created_at at time zone ${tz})::date <= d.day)::int as accounts, coalesce(act.n, 0)::int as active
    from d left join su using (day) left join act using (day) order by d.day`

  const [act] = await s`select
      (select count(distinct user_id) from api_log where user_id is not null and at > now() - interval '1 day')::int as dau,
      (select count(distinct user_id) from api_log where user_id is not null and at > now() - interval '7 days')::int as wau,
      (select count(distinct user_id) from api_log where user_id is not null and at > now() - interval '30 days')::int as mau,
      (select count(*) from users)::int as accounts,
      (select count(*) from users where created_at > ${start})::int as new_accounts,
      (select count(*) from users where coalesce(plan, '') in ('entry', 'premium', 'pro') and coalesce(plan_status, '') in ('active', 'trialing', 'past_due'))::int as paying`
  const plans = await s`select coalesce(plan, 'trial') as plan, count(*)::int as n from users group by 1 order by 2 desc`

  const total = users.length || 1
  const activation = {
    accounts: users.length,
    addedHome: users.filter((u) => u.homes > 0).length,
    rendered: users.filter((u) => u.renders > 0).length,
    shared: users.filter((u) => u.shares > 0).length,
    buyerViewed: users.filter((u) => u.buyer_views > 0).length,
    returned: users.filter((u) => u.active_days > 1).length,
  }
  return {
    days: n,
    totals: Object.fromEntries(Object.entries(act || {}).map(([k, v]) => [k, num(v)])),
    plans,
    activation,
    activationPct: Object.fromEntries(Object.entries(activation).map(([k, v]) => [k, Math.round((v / total) * 100)])),
    growth: growth.map((r) => ({ ...r, day: new Date(r.day).toISOString().slice(0, 10) })),
    users,
  }
}

// One user's full picture: profile, homes, and a merged activity timeline.
export async function superUserDetail(userId) {
  const s = await ensure()
  if (!s) return null
  const [user] = await s`select id, email, name, email_verified, created_at, last_seen_at, coalesce(plan, 'trial') as plan, plan_status, plan_source, plan_interval, period_end, cancel_at_period_end, terms_accepted_at, prefs from users where id = ${userId}`
  if (!user) return null
  const homes = await s`select p.id, coalesce(p.data->>'nickname', p.formatted_address, 'Untitled home') as name, p.created_at, p.updated_at, p.share_views, p.last_viewed_at,
      jsonb_array_length(coalesce(p.data->'photos', '[]'::jsonb))::int as photos, jsonb_array_length(coalesce(p.data->'designs', '[]'::jsonb))::int as designs,
      (select count(*) from shares sh where sh.property_id = p.id and sh.by_owner)::int as shares, (select coalesce(sum(opens), 0) from shares sh where sh.property_id = p.id)::int as opens,
      (select count(distinct visitor_id) from share_views v where v.property_id = p.id)::int as buyers
    from properties p where p.owner_user_id = ${userId} order by p.updated_at desc limit 100`
  const timeline = await s`(select at, 'request' as kind, method || ' ' || route as what, status, code, meta::text as detail from api_log where user_id = ${userId} order by at desc limit 250)
    union all (select at, 'action' as kind, name as what, null::int as status, null as code, coalesce(path, '') || coalesce(' ' || left(props::text, 300), '') as detail from events where user_id = ${userId} and name not in ('engagement', 'page_view') order by at desc limit 250)
    union all (select at, 'page' as kind, path as what, null::int, null, null from events where user_id = ${userId} and name = 'page_view' order by at desc limit 150)
    union all (select at, 'error' as kind, coalesce(method || ' ', '') || coalesce(path, route, '') as what, status, code, message as detail from error_log where user_id = ${userId} order by at desc limit 100)
    order by at desc limit 400`
  // Not "credits": the client reads a top-level `credits` as the viewer's own balance.
  const creditHistory = await s`select at, delta, kind, pool from credit_ledger where user_id = ${userId} order by at desc limit 50`
  return { user, homes, timeline, creditHistory }
}

// ---------------------------------------------------------------- owners: analytics for their own homes
export async function ownerAnalytics(userId, days = 30) {
  const s = await ensure()
  if (!s) return null
  const n = Math.min(365, Math.max(1, Math.round(days)))
  const tz = 'America/Los_Angeles'
  const end = new Date()
  const start = new Date(end.getTime() - n * 864e5).toISOString()
  const prev = new Date(end.getTime() - 2 * n * 864e5).toISOString()
  const homes = await s`select id, coalesce(data->>'nickname', formatted_address, 'Untitled home') as name, created_at from properties where owner_user_id = ${userId} order by updated_at desc limit 200`
  const ids = homes.map((h) => h.id)
  const empty = { days: n, homes: [], daily: [], totals: {}, previous: {}, countries: [], languages: [], sections: [] }
  if (!ids.length) return empty
  const daily = await s`with d as (select generate_series(((now() - ${n + ' days'}::interval) at time zone ${tz})::date, (now() at time zone ${tz})::date, interval '1 day')::date as day),
      v as (select (viewed_at at time zone ${tz})::date as day, count(*) as views, count(distinct visitor_id) as buyers from share_views where property_id = any(${ids}) and viewed_at > ${start} group by 1),
      sh as (select (created_at at time zone ${tz})::date as day, count(*) as shares from shares where property_id = any(${ids}) and by_owner and created_at > ${start} group by 1)
    select d.day, coalesce(v.views, 0)::int as views, coalesce(v.buyers, 0)::int as buyers, coalesce(sh.shares, 0)::int as shares from d left join v using (day) left join sh using (day) order by d.day`
  const totalsFor = async (from, to) => {
    const [t] = await s`select
        (select count(*) from share_views where property_id = any(${ids}) and viewed_at > ${from} and viewed_at <= ${to})::int as views,
        (select count(distinct visitor_id) from share_views where property_id = any(${ids}) and viewed_at > ${from} and viewed_at <= ${to})::int as buyers,
        (select count(*) from shares where property_id = any(${ids}) and by_owner and created_at > ${from} and created_at <= ${to})::int as shares,
        (select count(*) from share_views where property_id = any(${ids}) and share_id is not null and viewed_at > ${from} and viewed_at <= ${to})::int as opens,
        (select count(distinct email) from submissions where kind = 'email_capture' and property_id = any(${ids}) and created_at > ${from} and created_at <= ${to})::int as leads,
        (select coalesce(round(avg(ms)), 0) from (select session_id, sum((props->>'activeMs')::bigint) as ms from events where name = 'engagement' and property_id = any(${ids}) and props->>'kind' = 'share' and coalesce(user_id, '') <> ${userId} and session_id is not null and at > ${from} and at <= ${to} group by 1) x)::bigint as avg_ms`
    return Object.fromEntries(Object.entries(t || {}).map(([k, v]) => [k, Number(v || 0)]))
  }
  const totals = await totalsFor(start, end.toISOString())
  const previous = await totalsFor(prev, start)
  const per = await s`select p.id,
      (select count(*) from share_views v where v.property_id = p.id and v.viewed_at > ${start})::int as views,
      (select count(distinct visitor_id) from share_views v where v.property_id = p.id and v.viewed_at > ${start})::int as buyers,
      (select count(*) from shares sh where sh.property_id = p.id and sh.by_owner and sh.created_at > ${start})::int as shares,
      (select max(viewed_at) from share_views v where v.property_id = p.id) as last_viewed,
      (select coalesce(round(avg(ms)), 0) from (select session_id, sum((props->>'activeMs')::bigint) as ms from events where name = 'engagement' and property_id = p.id and props->>'kind' = 'share' and coalesce(user_id, '') <> ${userId} and session_id is not null and at > ${start} group by 1) x)::bigint as avg_ms,
      (select kv.key from events, jsonb_each_text(coalesce(props->'sections', '{}'::jsonb)) kv where name = 'engagement' and property_id = p.id and props->>'kind' = 'share' and coalesce(user_id, '') <> ${userId} and at > ${start} group by kv.key order by sum(kv.value::bigint) desc limit 1) as top_section
    from properties p where p.id = any(${ids})`
  const byId = Object.fromEntries(per.map((r) => [r.id, r]))
  const countries = await s`select coalesce(country, '—') as country, count(*)::int as n from share_views where property_id = any(${ids}) and viewed_at > ${start} group by 1 order by 2 desc limit 10`
  const languages = await s`select coalesce(lang, '—') as lang, count(*)::int as n from share_views where property_id = any(${ids}) and viewed_at > ${start} group by 1 order by 2 desc`
  const sections = await s`select kv.key as section, sum(kv.value::bigint)::bigint as ms from events, jsonb_each_text(coalesce(props->'sections', '{}'::jsonb)) kv
    where name = 'engagement' and property_id = any(${ids}) and props->>'kind' = 'share' and coalesce(user_id, '') <> ${userId} and at > ${start} group by 1 order by 2 desc`
  return {
    days: n,
    daily: daily.map((r) => ({ ...r, day: new Date(r.day).toISOString().slice(0, 10) })),
    totals,
    previous,
    homes: homes.map((h) => ({ ...h, ...byId[h.id], avg_ms: Number(byId[h.id]?.avg_ms || 0) })).sort((a, b) => b.views - a.views || String(b.last_viewed || '').localeCompare(String(a.last_viewed || ''))),
    countries,
    languages,
    sections: sections.map((r) => ({ section: r.section, ms: Number(r.ms || 0) })),
  }
}

// ---------------------------------------------------------------- error log
const clip = (v, n) => (v == null ? null : String(v).slice(0, n))
export async function insertErrors(rows) {
  const s = await ensure()
  if (!s || !rows.length) return 0
  for (const r of rows.slice(0, 50)) {
    await s`insert into error_log (at, source, level, method, route, path, page, status, code, message, detail, user_id, visitor_id, request_id, ip_hash, country, device, lang, shown)
      values (${r.at || new Date().toISOString()}, ${clip(r.source, 20)}, ${clip(r.level || 'error', 10)}, ${clip(r.method, 10)}, ${clip(r.route, 60)}, ${clip(r.path, 300)}, ${clip(r.page, 300)},
        ${Number.isFinite(r.status) ? r.status : null}, ${clip(r.code, 60)}, ${clip(r.message, 1000)}, ${clip(r.detail, 4000)}, ${clip(r.userId, 60)}, ${clip(r.visitorId, 40)},
        ${clip(r.requestId, 120)}, ${clip(r.ipHash, 40)}, ${clip(r.country, 4)}, ${clip(r.device, 12)}, ${clip(r.lang, 4)}, ${clip(r.shown, 12)})`
  }
  return rows.length
}

export async function listErrors({ days = 7, source = null, level = null, open = false, limit = 200 } = {}) {
  const s = await ensure()
  if (!s) return { rows: [], summary: [] }
  const since = new Date(Date.now() - Math.min(180, Math.max(1, days)) * 864e5).toISOString()
  const src = source || '%'
  const lvl = level || '%'
  const rows = await s`select e.id, e.at, e.source, e.level, e.method, e.route, e.path, e.page, e.status, e.code, e.message, e.detail, e.request_id, e.country, e.device, e.lang, e.shown, e.reviewed_at, e.user_id, u.email
    from error_log e left join users u on u.id = e.user_id
    where e.at > ${since} and e.source like ${src} and e.level like ${lvl} and (${!open} or e.reviewed_at is null)
    order by e.at desc limit ${Math.min(500, limit)}`
  const summary = await s`select source, level, coalesce(code, 'http_' || status) as code, coalesce(route, path) as where_, count(*)::int as n, max(at) as last_at,
      count(*) filter (where reviewed_at is null)::int as open
    from error_log where at > ${since} group by 1, 2, 3, 4 order by n desc limit 40`
  const [totals] = await s`select count(*)::int as n, count(*) filter (where reviewed_at is null)::int as open,
      count(*) filter (where at > now() - interval '24 hours')::int as day, count(*) filter (where level = 'error' and reviewed_at is null)::int as open_errors
    from error_log where at > ${since}`
  return { rows, summary, totals }
}

export async function reviewErrors({ ids = null, all = false, reviewed = true }) {
  const s = await ensure()
  if (!s) return 0
  const at = reviewed ? new Date().toISOString() : null
  if (all) return (await s`update error_log set reviewed_at = ${at} where reviewed_at is null returning id`).length
  const list = (ids || []).map(Number).filter(Number.isFinite).slice(0, 500)
  if (!list.length) return 0
  return (await s`update error_log set reviewed_at = ${at} where id = any(${list}) returning id`).length
}

export async function getImage(id) {
  const s = await ensure()
  if (!s) return null
  const rows = await s`select content_type, encode(data, 'base64') as b64 from images where id = ${id}`
  if (!rows[0]) return null
  return { contentType: rows[0].content_type, buffer: Buffer.from(rows[0].b64.replace(/\s/g, ''), 'base64') }
}

// ---------------------------------------------------------------- analytics + logs

export function insertEvents(list) {
  if (!list.length) return Promise.resolve(null)
  return safe('insertEvents', async (s) => {
    for (const e of list) {
      await s`insert into events (at, name, path, property_id, visitor_id, session_id, user_id, lang, country, region, device, referrer, props)
        values (${e.at}, ${e.name}, ${e.path}, ${e.propertyId}, ${e.visitorId}, ${e.sessionId}, ${e.userId}, ${e.lang},
          ${e.country}, ${e.region}, ${e.device}, ${e.referrer}, ${j(e.props)}::jsonb)`
    }
    return true
  })
}

export function insertApiLog(r) {
  return safe('insertApiLog', async (s) => {
    await s`insert into api_log (method, route, status, ms, user_id, ip_hash, visitor_id, country, code, meta)
      values (${r.method}, ${r.route}, ${r.status}, ${r.ms}, ${r.userId}, ${r.ipHash}, ${r.visitorId}, ${r.country}, ${r.code}, ${j(r.meta)}::jsonb)`
    // Retention (see the privacy policy): request logs 90 days, analytics events 13 months.
    if (Math.random() < 0.002) {
      await s`delete from api_log where at < now() - interval '90 days'`
      await s`delete from error_log where at < now() - interval '180 days'`
      await s`delete from events where at < now() - interval '400 days'`
      await s`delete from leads where user_id is null and source in ('buyer', 'visitor') and last_seen < now() - interval '24 months'`
    }
    return true
  })
}

// Requests in the last `minutes` for this caller on this route (rate limits).
export async function recentRequests({ route, ipHash, userId, minutes, method = null }) {
  const s = await ensure()
  if (!s) return 0
  const since = new Date(Date.now() - minutes * 60000).toISOString()
  const m = method || '%'
  const rows = userId
    ? await s`select count(*)::int as n from api_log where user_id = ${userId} and route = ${route} and at > ${since} and coalesce(method, '') like ${m}`
    : await s`select count(*)::int as n from api_log where ip_hash = ${ipHash} and route = ${route} and at > ${since} and coalesce(method, '') like ${m}`
  return rows[0]?.n || 0
}

// ---------------------------------------------------------------- privacy

export async function addPrivacyRequest({ id, kind, email, userId = null, details = null, meta = null }) {
  const s = await ensure()
  if (!s) return false
  await s`insert into privacy_requests (id, kind, email, user_id, details, meta) values (${id}, ${kind}, ${email}, ${userId}, ${details}, ${j(meta)}::jsonb)`
  return true
}

// Everything we hold about an account, for "Download my data".
export async function exportUser(user) {
  const s = await ensure()
  if (!s) return null
  const [account] = await s`select id, email, name, created_at, last_seen_at, plan, plan_status, plan_source, plan_interval, period_end, cancel_at_period_end from users where id = ${user.id}`
  const lead = await s`select email, first_seen, last_seen, lang, country, region, source from leads where email = ${user.email}`
  const properties = await s`select id, data, created_at, updated_at, share_views from properties where owner_user_id = ${user.id}`
  const designs = await s`select * from designs where user_id = ${user.id} order by created_at`
  const renders = await s`select id, property_id, photo_id, design_id, mode, style, light, feedback, model, ms, src, created_at from renders where user_id = ${user.id} order by created_at`
  const submissions = await s`select kind, address, property_id, lang, meta, created_at from submissions where user_id = ${user.id} or email = ${user.email} order by created_at`
  const events = await s`select at, name, path, property_id, lang, country, props from events where user_id = ${user.id} order by at`
  const requests = await s`select id, at, kind, status from privacy_requests where user_id = ${user.id} or email = ${user.email}`
  const shares = await s`select id, property_id, channel, recipients, sender_name, message, opens, created_at from shares where user_id = ${user.id} order by created_at`
  const terms = await s`select version, at, context from terms_acceptances where user_id = ${user.id} order by at`
  return { termsAcceptances: terms, exportedAt: new Date().toISOString(), account: account || { id: user.id, email: user.email }, lead: lead[0] || null, properties, designs, renders, shares, submissions, events, privacyRequests: requests }
}

// "Delete my account": every home, image, design and render the account made, its
// lead record, submissions and analytics. Request logs keep only a hashed IP and
// are deleted on their normal 90-day schedule; the user id is removed from them now.
export async function deleteUserData(user) {
  const s = await ensure()
  if (!s) return { properties: 0 }
  const props = await s`select id, data from properties where owner_user_id = ${user.id}`
  // Files in Blob storage are removed by the caller (storage.js) from these URLs.
  const files = props.flatMap((p) => (p.data?.photos || []).flatMap((ph) => [ph.source === 'owner' ? ph.src : null, ...(ph.versions || []).map((v) => v.src)])).filter((u) => /^https:/.test(u || ''))
  for (const p of props) await deleteProperty(p.id)
  await s`delete from designs where user_id = ${user.id}`
  await s`delete from renders where user_id = ${user.id}`
  await s`delete from submissions where user_id = ${user.id} or email = ${user.email}`
  await s`delete from events where user_id = ${user.id}`
  await s`delete from shares where user_id = ${user.id}`
  await s`update api_log set user_id = null where user_id = ${user.id}`
  await s`delete from leads where email = ${user.email}`
  await s`update billing_events set user_id = null where user_id = ${user.id}`
  await s`delete from terms_requests where owner_user_id = ${user.id}`
  await s`delete from terms_acceptances where user_id = ${user.id}`
  await s`delete from credit_ledger where user_id = ${user.id}`
  await s`delete from extras where user_id = ${user.id}`
  await s`delete from users where id = ${user.id}`
  return { properties: props.length, files }
}

// The sign-in record (Neon Auth keeps it in the neon_auth schema of this same
// database). Used when Neon Auth's own delete-user endpoint is not enabled.
export async function deleteAuthUser(userId) {
  const s = await ensure()
  if (!s) return false
  const cols = await s`select table_name, column_name from information_schema.columns
    where table_schema = 'neon_auth' and column_name in ('userId', 'user_id')`
  for (const c of cols) {
    if (c.table_name === 'user' || !/^[A-Za-z_]+$/.test(c.table_name) || !/^[A-Za-z_]+$/.test(c.column_name)) continue
    await s.query(`delete from neon_auth."${c.table_name}" where "${c.column_name}"::text = $1`, [userId])
  }
  const gone = await s.query('delete from neon_auth."user" where id::text = $1 returning id', [userId])
  return gone.length > 0
}

// ---------------------------------------------------------------- admin

export async function adminOverview() {
  const s = await ensure()
  if (!s) return null
  const count = async (q) => (await q)[0]?.n ?? 0
  const day = new Date(Date.now() - 864e5).toISOString()
  const week = new Date(Date.now() - 7 * 864e5).toISOString()
  const totals = {
    users: await count(s`select count(*)::int as n from users`),
    leads: await count(s`select count(*)::int as n from leads`),
    properties: await count(s`select count(*)::int as n from properties`),
    designs: await count(s`select count(*)::int as n from designs`),
    renders: await count(s`select count(*)::int as n from renders`),
    shareViews: await count(s`select count(*)::int as n from share_views`),
    shares: await count(s`select count(*)::int as n from shares`),
    shareOpens: await count(s`select coalesce(sum(opens), 0)::int as n from shares`),
    events24h: await count(s`select count(*)::int as n from events where at > ${day}`),
    requests24h: await count(s`select count(*)::int as n from api_log where at > ${day}`),
    errors24h: await count(s`select count(*)::int as n from api_log where at > ${day} and status >= 500`),
    openPrivacyRequests: await count(s`select count(*)::int as n from privacy_requests where status = 'open'`),
  }
  const visitors7d = await count(s`select count(distinct visitor_id)::int as n from events where at > ${week} and visitor_id is not null`)
  const pageViews7d = await count(s`select count(*)::int as n from events where at > ${week} and name = 'page_view'`)
  const topEvents = await s`select name, count(*)::int as n from events where at > ${week} group by name order by n desc limit 25`
  const topPages = await s`select path, count(*)::int as n from events where at > ${week} and name = 'page_view' group by path order by n desc limit 15`
  const routes = await s`select route, count(*)::int as n, round(avg(ms))::int as avg_ms,
      sum(case when status >= 500 then 1 else 0 end)::int as errors,
      sum(case when status between 400 and 499 then 1 else 0 end)::int as rejected
    from api_log where at > ${week} group by route order by n desc limit 30`
  const errors = await s`select at, method, route, status, code, ms, meta from api_log where status >= 500 order by at desc limit 40`
  const clientErrors = await s`select at, path, props from events where name = 'client_error' order by at desc limit 25`
  const leads = await s`select email, first_seen, last_seen, source, first_context, country, region, submissions from leads order by last_seen desc limit 40`
  const users = await s`select id, email, name, email_verified, created_at, last_seen_at, coalesce(plan, 'free') as plan, plan_source, plan_status, period_end from users order by created_at desc limit 40`
  const plans = await s`select coalesce(plan, 'free') as plan, coalesce(plan_source, '-') as source, coalesce(plan_status, '-') as status, count(*)::int as n from users group by 1, 2, 3 order by n desc`
  const billing = await s`select at, source, type, user_id, data from billing_events order by at desc limit 40`
  const termsLog = await s`select at, 'accepted' as kind, email as who, version as detail from terms_acceptances union all select at, 'request' as kind, coalesce(requester_email, 'anonymous') as who, property_id || case when emailed then ' · emailed' else '' end as detail from terms_requests order by at desc limit 40`
  const properties = await s`select id, formatted_address, owner_email, origin, share_views, created_at, updated_at,
      jsonb_array_length(coalesce(data->'photos', '[]'::jsonb)) as photos, jsonb_array_length(coalesce(data->'designs', '[]'::jsonb)) as designs
    from properties order by updated_at desc limit 40`
  const designs = await s`select id, property_id, mode, style, light, status, photos, done, failed, created_at from designs order by created_at desc limit 30`
  const privacy = await s`select id, at, kind, email, status, details from privacy_requests order by at desc limit 30`
  const shares = await s`select sh.created_at, sh.property_id, p.formatted_address, sh.channel, sh.by_owner, sh.recipient_count, sh.sent, sh.opens
    from shares sh left join properties p on p.id = sh.property_id order by sh.created_at desc limit 40`
  const engagement = await siteEngagement(7).catch(() => null)
  return { engagement, totals: { ...totals, visitors7d, pageViews7d }, topEvents, topPages, routes, errors, clientErrors, leads, users, plans, billing, termsLog, properties, designs, privacy, shares }
}

// ---------------------------------------------------------------- billing

const PLAN_COLS = { plan: 'plan', status: 'plan_status', source: 'plan_source', interval: 'plan_interval', periodEnd: 'period_end', cancelAtPeriodEnd: 'cancel_at_period_end', customerId: 'stripe_customer_id', subscriptionId: 'stripe_subscription_id', addons: 'plan_addons' }

export async function getBillingRow(userId) {
  const s = await ensure()
  if (!s) return null
  const [row] = await s`select id, email, created_at, plan, plan_status, plan_source, plan_interval, period_end, cancel_at_period_end,
      stripe_customer_id, stripe_subscription_id, plan_updated_at, coalesce(plan_addons, 0)::int as plan_addons from users where id = ${userId}`
  return row || null
}

// Make sure the account row exists before billing writes to it.
export async function ensureUserRow(user) {
  const s = await ensure()
  if (!s) return
  await s`insert into users (id, email, name, email_verified) values (${user.id}, ${user.email}, ${user.name || null}, ${user.emailVerified})
    on conflict (id) do nothing`
}

export async function setBilling(userId, patch) {
  const s = await ensure()
  if (!s) return null
  const sets = []
  const vals = []
  for (const [k, col] of Object.entries(PLAN_COLS)) {
    if (!(k in patch)) continue
    vals.push(patch[k] ?? null)
    sets.push(`${col} = $${vals.length}`)
  }
  if (!sets.length) return getBillingRow(userId)
  vals.push(userId)
  await s.query(`update users set ${sets.join(', ')}, plan_updated_at = now() where id = $${vals.length}`, vals)
  return getBillingRow(userId)
}

export async function userByStripeCustomer(customerId) {
  const s = await ensure()
  if (!s || !customerId) return null
  const [row] = await s`select id, email from users where stripe_customer_id = ${customerId}`
  return row || null
}

// Returns false when this event id was already recorded (Stripe retries webhooks).
export async function recordBillingEvent({ id, source, type, userId = null, data = null }) {
  const s = await ensure()
  if (!s) return true
  const rows = await s`insert into billing_events (id, source, type, user_id, data) values (${id}, ${source}, ${type}, ${userId}, ${j(data)}::jsonb)
    on conflict (id) do nothing returning id`
  return rows.length > 0
}

// ---------------------------------------------------------------- credits

// What the account has used this cycle and how many bought credits remain.
export async function creditBalance(userId, { since, packPool, planPool }) {
  const s = await ensure()
  if (!s) return { planUsed: 0, cycleUsed: 0, packs: 0 }
  const [r] = await s`select
      (select count(*)::int from credit_ledger where user_id = ${userId} and pool = ${planPool} and at >= ${since}) as plan_used,
      (select count(*)::int from credit_ledger where user_id = ${userId} and delta < 0 and at >= ${since}) as cycle_used,
      (select coalesce(sum(delta), 0)::int from credit_ledger where user_id = ${userId} and ((delta > 0 and mode = ${packPool.slice(5)}) or pool = ${packPool})) as packs`
  return { planUsed: r?.plan_used || 0, cycleUsed: r?.cycle_used || 0, packs: Math.max(0, r?.packs || 0) }
}

// Take one credit: from the monthly allotment while it lasts, then from bought
// credits. One statement, so parallel renders can't spend the same credit twice
// in the common case. Returns the pool charged, or null when nothing is left.
export async function debitCredit(userId, { id, kind, since, allotment, packPool, planPool, ref = null, unmetered = false }) {
  const s = await ensure()
  if (!s) return 'unmetered'
  if (unmetered) {
    await s`insert into credit_ledger (id, user_id, delta, kind, pool, ref) values (${id}, ${userId}, -1, ${kind}, 'unmetered', ${ref})`
    return 'unmetered'
  }
  const rows = await s`with st as (
      select
        (select count(*) from credit_ledger where user_id = ${userId} and pool = ${planPool} and at >= ${since}) as used,
        (select coalesce(sum(delta), 0) from credit_ledger where user_id = ${userId} and ((delta > 0 and mode = ${packPool.slice(5)}) or pool = ${packPool})) as packs
    )
    insert into credit_ledger (id, user_id, delta, kind, pool, ref)
    select ${id}, ${userId}, -1, ${kind}, case when st.used < ${allotment} then ${planPool} else ${packPool} end, ${ref} from st
    where st.used < ${allotment} or st.packs > 0
    returning pool`
  return rows[0]?.pool || null
}

// Extras still running for this account (in this billing mode), soonest to end first.
export async function activeExtras(userId, mode) {
  const s = await ensure()
  if (!s) return []
  return s`select id, at, expires_at, homes, credits from extras where user_id = ${userId} and mode = ${mode} and expires_at > now() order by expires_at`
}

// One Extra: property slots until expiresAt, plus its credits as a never-expiring
// pack. Idempotent on id (a webhook and the return page can both apply it).
export async function addExtra(userId, { id, homes, credits, expiresAt, mode, ref = null }) {
  const s = await ensure()
  if (!s) return false
  const rows = await s`insert into extras (id, user_id, expires_at, homes, credits, mode, ref) values (${id}, ${userId}, ${expiresAt}, ${homes}, ${credits}, ${mode}, ${ref})
    on conflict (id) do nothing returning id`
  if (!rows.length) return false
  await s`insert into credit_ledger (id, user_id, delta, kind, mode, ref) values (${'ex_' + id}, ${userId}, ${credits}, 'extra', ${mode}, ${ref})
    on conflict (id) do nothing`
  return true
}

// A render that failed gives its credit back.
export async function refundCredit(id) {
  const s = await ensure()
  if (!s) return
  await s`delete from credit_ledger where id = ${id} and delta < 0`
}

// Credits bought (or granted). Idempotent on id, so a webhook and the return
// from Checkout can both apply the same purchase.
export async function addCredits(userId, { id, credits, mode, kind = 'purchase', ref = null, data = null }) {
  const s = await ensure()
  if (!s) return false
  const rows = await s`insert into credit_ledger (id, user_id, delta, kind, mode, ref, data) values (${id}, ${userId}, ${credits}, ${kind}, ${mode}, ${ref}, ${j(data)}::jsonb)
    on conflict (id) do nothing returning id`
  return rows.length > 0
}

export async function usageFor(userId, propertyId = null) {
  const s = await ensure()
  if (!s) return { homes: 0, runs30d: 0 }
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const [h] = await s`select count(*)::int as n from properties where owner_user_id = ${userId}`
  const [r] = await s`select count(*)::int as n from designs where user_id = ${userId} and created_at > ${since}`
  const out = { homes: h?.n || 0, runs30d: r?.n || 0 }
  if (propertyId) {
    // Whole-house designs only; single-photo edits carry a scope.
    const [d] = await s`select count(*)::int as n from properties, jsonb_array_elements(coalesce(data->'designs', '[]'::jsonb)) as dz
      where id = ${propertyId} and dz->'scope' is null`
    const [e] = await s`select coalesce(sum(recipient_count), 0)::int as n from shares where property_id = ${propertyId} and by_owner and channel = 'email'`
    out.designs = d?.n || 0
    out.emails = e?.n || 0
  }
  return out
}

// ---------------------------------------------------------------- terms

export const ownerAccepted = (row, version) => Boolean(row?.owner_terms_at && row.owner_terms_version === version)

export async function acceptTerms({ user, version, ipHash = null, userAgent = null, context = null }) {
  const s = await ensure()
  if (!s) return null
  await s`insert into users (id, email, name, email_verified) values (${user.id}, ${user.email}, ${user.name || null}, ${user.emailVerified})
    on conflict (id) do nothing`
  const [row] = await s`update users set terms_accepted_at = now(), terms_version = ${version} where id = ${user.id} returning terms_accepted_at`
  await s`insert into terms_acceptances (user_id, email, version, ip_hash, user_agent, context) values (${user.id}, ${user.email}, ${version}, ${ipHash}, ${userAgent ? String(userAgent).slice(0, 300) : null}, ${context})`
  return row?.terms_accepted_at || null
}

export async function addTermsRequest(r) {
  const s = await ensure()
  if (!s) return
  await s`insert into terms_requests (id, property_id, owner_user_id, owner_email, requester_email, visitor_id, ip_hash, share_id, emailed)
    values (${r.id}, ${r.propertyId}, ${r.ownerUserId}, ${r.ownerEmail}, ${r.requesterEmail}, ${r.visitorId}, ${r.ipHash}, ${r.shareId}, ${r.emailed})`
}

// How many requests reached the owner's inbox for this home recently (one email an hour).
export async function recentTermsEmails(propertyId, minutes = 60) {
  const s = await ensure()
  if (!s) return 0
  const since = new Date(Date.now() - minutes * 60000).toISOString()
  const [r] = await s`select count(*)::int as n from terms_requests where property_id = ${propertyId} and emailed and at > ${since}`
  return r?.n || 0
}

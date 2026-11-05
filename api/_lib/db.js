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
const SCHEMA_VERSION = 9

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
      await s`delete from events where at < now() - interval '400 days'`
      await s`delete from leads where user_id is null and source in ('buyer', 'visitor') and last_seen < now() - interval '24 months'`
    }
    return true
  })
}

// Requests in the last `minutes` for this caller on this route (rate limits).
export async function recentRequests({ route, ipHash, userId, minutes }) {
  const s = await ensure()
  if (!s) return 0
  const since = new Date(Date.now() - minutes * 60000).toISOString()
  const rows = userId
    ? await s`select count(*)::int as n from api_log where user_id = ${userId} and route = ${route} and at > ${since}`
    : await s`select count(*)::int as n from api_log where ip_hash = ${ipHash} and route = ${route} and at > ${since}`
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
  const props = await s`select id from properties where owner_user_id = ${user.id}`
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
  await s`delete from users where id = ${user.id}`
  return { properties: props.length }
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
  return { totals: { ...totals, visitors7d, pageViews7d }, topEvents, topPages, routes, errors, clientErrors, leads, users, plans, billing, termsLog, properties, designs, privacy, shares }
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

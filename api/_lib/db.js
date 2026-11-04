import { neon } from '@neondatabase/serverless'
import { config } from './config.js'

let sql = null
let ready = null

function db() {
  if (!config.databaseUrl) return null
  if (!sql) sql = neon(config.databaseUrl)
  return sql
}

// Tables are created on first use so a fresh Neon database needs no setup step.
async function ensure() {
  const s = db()
  if (!s) return null
  if (!ready) {
    ready = (async () => {
      await s`create table if not exists leads (
        email text primary key,
        first_seen timestamptz not null default now(),
        last_seen timestamptz not null default now(),
        lang text,
        submissions integer not null default 0
      )`
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
      await s`create table if not exists properties (
        id text primary key,
        owner_email text,
        data jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`
      // Placeholder for accounts (not wired yet). Kept here so the schema is ready.
      await s`create table if not exists users (
        id text primary key,
        email text unique not null,
        name text,
        created_at timestamptz not null default now()
      )`
    })().catch((e) => {
      ready = null
      throw e
    })
  }
  await ready
  return s
}

// Every submission (address search, photo upload, render, feedback) is logged
// against the captured email. Never throws — capture must not block the product.
export async function logSubmission({ email, kind, address = null, propertyId = null, lang = null, meta = null }) {
  try {
    const s = await ensure()
    if (!s || !email) return false
    const e = email.trim().toLowerCase()
    await s`insert into leads (email, lang, submissions) values (${e}, ${lang}, 1)
      on conflict (email) do update set last_seen = now(), submissions = leads.submissions + 1, lang = coalesce(excluded.lang, leads.lang)`
    await s`insert into submissions (email, kind, address, property_id, lang, meta)
      values (${e}, ${kind}, ${address}, ${propertyId}, ${lang}, ${meta ? JSON.stringify(meta) : null})`
    return true
  } catch (err) {
    console.error('[db] logSubmission', err.message)
    return false
  }
}

export async function saveProperty(id, data, ownerEmail) {
  const s = await ensure()
  if (!s) return false
  await s`insert into properties (id, owner_email, data) values (${id}, ${ownerEmail || null}, ${JSON.stringify(data)})
    on conflict (id) do update set data = excluded.data, updated_at = now()`
  return true
}

export async function loadProperty(id) {
  const s = await ensure()
  if (!s) return null
  const rows = await s`select data, updated_at from properties where id = ${id}`
  return rows[0] ? { ...rows[0].data, updatedAt: rows[0].updated_at } : null
}

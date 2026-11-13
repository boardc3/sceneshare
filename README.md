# Sceneshare

Show a home to buyers who can't be there. Enter an address: Sceneshare finds the home on an
interactive Mapbox map, pulls its listing photos from Zillow or Redfin (through ScraperAPI),
restyles any room with **Nano Banana Flash** (Gemini 3.1 Flash Image) while keeping
the room's structure, camera and view exact, and gives the owner one share link. English and
Simplified Chinese throughout. Owners can also take or upload their own photos.

React (Vite) front end + Vercel Node functions in `api/`. No videos, by design.

## Status — 2026-11-04 (live)

**Live at https://sceneshare-three.vercel.app** (Vercel project `sceneshare`, team
chris-ccolbertcoms-projects; every push to `main` deploys). Vercel Authentication protects
preview deployments only, so production and share links are public.

Verified on production, 2026-11-04:
- Mapbox address suggestions, geocoding, nearby places; satellite hero and property map.
- Orange County assessor parcel (APN, area, outline) reconciled to the listed lot size.
- Zillow via ScraperAPI: 24 listing photos for a home on the market pulled in ~20 s, stored in
  Neon, facts read. Off-market homes return facts and no photos; Redfin is found through Google
  and is often absent.
- Nano Banana Flash: restyle ~34 s (with one automatic refire), change request ~17 s,
  twilight relight ~17 s, all stored and served from Neon.
- Neon: leads, submissions, properties, photos, renders, share views and images all written;
  owner-only snapshot lock returns 403 to anyone else.

**Owed**
- Parcel outlines for counties beyond Orange County (`api/_lib/parcel.js`, `PROVIDERS`).
- Accounts (placeholders only; the Neon integration also provisioned Neon Auth, which is the
  natural provider when sign-ups are built).
- Vercel Blob before heavy use (images currently live in Neon).
- QA rows from the launch check use the email `qa-test@sceneshare.invalid`; remove them with
  the SQL in "What gets saved" if you want a clean slate.

## Environment (Vercel → Project → Settings → Environment Variables)

| variable | what it powers | needed |
|---|---|---|
| `GOOGLE_API_KEY` | Nano Banana Flash renders (Generative Language API) | yes |
| `MAPBOX_TOKEN` | the maps, address suggestions, geocoding and nearby places. A **public** token (`pk.…`) — the browser receives it, so restrict it in Mapbox to `localhost` and your Vercel domains | yes |
| `MAPBOX_PERMANENT_GEOCODING` | set to `1` once the Mapbox account has permanent geocoding; Mapbox's terms require it for addresses you store (share links) | before launch |
| `SCRAPERAPI_KEY` | Zillow / Redfin listing photos and facts | for listing photos |
| `DATABASE_URL` | Neon Postgres, added automatically by Vercel → Storage → Neon. A prefixed name works too (this project's integration created `SCENESHARE_DATABASE_URL`). Holds everything below, plus images when Blob is not set up | yes |
| `BLOB_READ_WRITE_TOKEN` | optional: Vercel Blob for images. When present, new images go to Blob and Neon keeps only the records | no |
| `GEMINI_IMAGE_MODEL` | optional override, default `gemini-3.1-flash-image` (falls back to `-preview`) | no |
| `GEMINI_IMAGE_SIZE` | optional, default `2K` | no |
| `RESEND_API_KEY`, `SHARE_FROM_EMAIL` | share emails sent by Sceneshare (Resend, verified domain). Without them the sender's own mail app opens | for emailed shares |
| `BILLING_MODE` | `preview` (default: plans, limits and upgrades all work, no money moves), `stripe` (Stripe Checkout), `off` (no limits) | no |
| `STRIPE_SECRET_KEY` | Stripe secret key. `sk_test_…` = test mode, no real charges. `sk_live_…` is refused unless `STRIPE_ALLOW_LIVE=1` | for payments |
| `STRIPE_WEBHOOK_SECRET` | signing secret of the webhook endpoint `https://www.sceneshare.app/api/billing?webhook=1` | for payments |
| `STRIPE_ALLOW_LIVE` | `1` to accept a live key (real charges) | at launch |

Tables create themselves on first use. `/api/health` shows which features are switched on.
Maps are Mapbox GL JS (`mapbox-gl` 3.33.0, its own lazily loaded chunk), with the token served from
`/api/health` so it can change in Vercel without a rebuild. This replaces doc 07's keyless
Leaflet/Esri rule for this project, at Chris's request (2026-11-04).

## Plans and billing

**Paid beta (2026-11-13).** Accounts opened on or after `PAID_BETA_FROM` (default
2026-11-13 18:00 UTC) have no free trial: they pay $50 once for 30 days of the beta
allowance (`ACCOUNT_MAX_HOMES` / `ACCOUNT_MAX_RENDERS`). Nothing renews; a month can be
added in the last 7 days or after it ends. Accounts opened earlier keep free early access
in every billing mode. `PAID_BETA=0` switches this off. Taking the payment needs
`BILLING_MODE=stripe` with live keys (below); in `preview` only admins and
`PREVIEW_TESTER_EMAILS` can start a beta month, and everyone else is told payments open soon.
The webhook endpoint must also send `checkout.session.completed`.

New accounts get a 7-day free trial (2 homes, 50 render credits, 10 emailed shares per home).
Entry: $49/month or $490/year, 2 new homes a month, 150 render credits a month.
Premium: $99/month or $990/year, 5 new homes a month, 300 render credits a month; extra
properties are one-off purchases at $15 each (30 days, 30 re-renders each).
New-home allowances count homes added in the billing month (the same cycle as credits);
homes already added stay, and deleting one does not free its place.
One credit = one rendered image; credit packs (100 for $15, 500 for $60) never expire.
After the trial or a plan ends, share links stay online for 14 days; then buyers see an
"offline" page with the agent's email and a button that emails the agent to bring it back.
Choosing a plan brings every page back with the same links.
Admins (`ADMIN_EMAILS`) are always Premium, unmetered. Limits are enforced on the server
(`api/_lib/billing.js`) and answered with HTTP 402 `plan_limit`, which opens the plan prompt.
The nav credit meter and `/plan` show plan, credits, homes and days left. Stripe products
(Entry, Premium, add-on) are created on first checkout and found by `metadata.ss_key`. Plan state lives on `users`; every billing
action and webhook is logged in `billing_events` and shown on `/admin`.

Going from preview to payments:
1. Stripe (test mode) → Developers → API keys: copy the secret key into `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → Add endpoint `https://www.sceneshare.app/api/billing?webhook=1` with
   the `customer.subscription.*`, `checkout.session.completed` and `invoice.payment_failed`
   events; copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
3. Settings → Billing → Customer portal: save the default settings once (turns on "Manage billing").
4. Set `BILLING_MODE=stripe`, redeploy. Test with card 4242 4242 4242 4242.
5. At launch: live keys + a live webhook, `STRIPE_ALLOW_LIVE=1`, redeploy.

Preview upgrades stop counting once Stripe is on (and the reverse), so nobody keeps a free plan.

## What gets saved (Neon)

Tables create and upgrade themselves on first use (`api/_lib/db.js`) — no migration step.

| table | one row per | holds |
|---|---|---|
| `leads` | email captured | first/last seen, language, country/region (from Vercel's headers — no IP), submissions count |
| `submissions` | action | every address search, listing lookup, upload, render and change request, with its details |
| `properties` | home | address parts, lat/lng, Mapbox id, parcel APN/area/geometry, nearby places, Zillow facts, listing links, share-view count, and `data` — the snapshot the buyer page is drawn from |
| `photos` | photo | source (zillow / redfin / owner), the original listing URL, our copy, size, caption, hidden, chosen version |
| `renders` | restyle / relight / change | mode, style, light, change text, model, alignment score, attempts, time, image |
| `share_views` | buyer visit | when, language, country, referrer |
| `images` | image | the bytes, when Blob is not set up — served at `/api/media?id=…` with a one-year cache |
| `users` | — | placeholder for accounts |

Only the email that created a property can overwrite its snapshot.

View it: Vercel → Storage → the Neon database → **Open in Neon** (no separate Neon login), then
Tables or the SQL Editor. Remove the launch-check rows with:

```sql
delete from images where property_id in (select id from properties where owner_email = 'qa-test@sceneshare.invalid');
delete from photos where email = 'qa-test@sceneshare.invalid';
delete from renders where email = 'qa-test@sceneshare.invalid';
delete from share_views where property_id in (select id from properties where owner_email = 'qa-test@sceneshare.invalid');
delete from properties where owner_email = 'qa-test@sceneshare.invalid';
delete from submissions where email = 'qa-test@sceneshare.invalid';
delete from leads where email = 'qa-test@sceneshare.invalid';
``` Images in Neon cost about
0.3–0.5 MB each (listing photos are kept at 1600 px), so a fully restyled home is roughly
5–10 MB; add Vercel Blob before heavy use and new images move there automatically.

## How a render works

1. The source photo is normalised (EXIF orientation, 2048 px long edge).
2. The prompt (`api/_lib/prompts.js`) opens with *edit the attached photograph in place*, then the
   Template G locks — camera, room dimensions, every opening, the view, the building, furniture
   footprints — then the design direction, the light, the photo finish and the negative list.
3. Gemini returns the image at the nearest supported ratio; it is resized to the source's exact
   aspect ratio (long edge 1600–2048 px).
4. **Overlay check** (`api/_lib/align.js`): edge-map correlation against the source. Below 0.32
   the take is refired once with a stronger lock and the better-aligned take is kept. Calibrated
   on the landing demo: aligned restyle 0.42, drifted takes 0.25–0.28.

Feedback edits send the original photo as reference 1 (geometry) and the current proposal as
reference 2 (design), and change only what was asked.

## Sign-ups (placeholder)

`Sign in` opens a disabled sign-in / create-account form that says accounts are coming.
`src/lib/auth.js` and `api/auth.js` (501) are the seams to replace; `users` exists in Neon.
Until then the captured email is the owner key (`properties.owner_email`).

## Decisions made without asking (runbook: decide, log it here)

- **Vite + React + Vercel functions**, not Next.js like sceneit: Vite is the house stack (doc 05)
  and the functions sit in `api/` next to the static build.
- **One listing source per home**: Zillow and Redfin usually carry the same MLS photos; the one
  with more photos wins (Zillow on a tie) so the gallery has no duplicates.
- **Zillow's `_rb` search URL is not used** — for unlisted homes it silently returns a city search
  page. The zpid comes from Zillow's address autocomplete instead.
- **Redfin's stingray autocomplete is not used** — it refused plain and premium ScraperAPI
  requests; the property page is found through ScraperAPI's Google endpoint and matched on
  number + street + zip (+ unit).
- **Off-market pages**: Redfin pages also carry nearby listings' photos, so only photos sharing
  the page's own `og:image` listing key are kept; Zillow's signed Street View stand-ins are skipped.
- **Every photo is credited** in the reader's language (listing photo via Zillow/Redfin, or owner)
  and every proposal is labelled a conceptual rendering.
- **Mapbox, not Google Maps** (Chris, 2026-11-04). Mapbox has no Street View, so homes without
  listing photos start from the owner's own photos.
- **Simplified Chinese** for 中文. Chinese fonts load only when Chinese is chosen.
- **No hero video**, per the brief ("never do videos"); the hero is the live satellite map.

## Run it locally (review)

Double-click **Start Sceneshare.command** in this folder, or in Terminal:

```bash
cd ~/Sceneshare/repo && nvm use 22 && npm ci && npm run dev -- --open
```

Needs Node 20.19+ (Vite 8); `.nvmrc` pins 22, and the start file switches to it with nvm (or
Homebrew) and reinstalls if an older Node left the install incomplete.
Opens http://localhost:5173. The API runs inside the dev server. Keys come from your shell
profile (`export GOOGLE_API_KEY=…` etc. in `~/.zshrc`) or from a `.env.local` file in this folder
(gitignored — copy `.env.example`). Without keys the landing page, the demo and "start with your
own photos" still work; the maps and address search need `MAPBOX_TOKEN`, restyling needs
`GOOGLE_API_KEY`, listing photos need `SCRAPERAPI_KEY`.

Checks: `npm run check && npm run build`.

## Ship it

```bash
SLUG=sceneshare
DIR=~/Sceneshare/repo
```

Once, on a Mac whose `~/Sceneshare/repo` was copied in rather than cloned — connects the folder
to GitHub without touching any file:

```bash
cd ~/Sceneshare/repo && git init -b main && git remote add origin https://github.com/boardc3/sceneshare.git && git fetch origin && git reset origin/main && git branch -u origin/main && git status
```

Every time, first time included:

```bash
cd ~/Sceneshare/repo && bash push.sh "what changed"
```

`push.sh` (kit v2) commits, creates github.com/boardc3/sceneshare on the first run (`gh repo
create`, private) and pushes, creates and links the Vercel project `sceneshare`, verifies the Git
connection through the Vercel API, waits for a READY production deployment of this commit (or
deploys the folder directly), and prints `LIVE:` only when the production URL answers 200. Add the environment variables above in Vercel before the first real use, then redeploy once
(Vercel → Deployments → Redeploy) so the functions see them.

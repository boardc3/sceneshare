# Sceneshare

Show a home to buyers who can't be there. Enter an address: Sceneshare finds the home on an
interactive Mapbox map, pulls its listing photos from Zillow or Redfin (through ScraperAPI),
restyles any room with **Nano Banana Flash** (Gemini 3.1 Flash Image) while keeping
the room's structure, camera and view exact, and gives the owner one share link. English and
Simplified Chinese throughout. Owners can also take or upload their own photos.

React (Vite) front end + Vercel Node functions in `api/`. No videos, by design.

## Status — 2026-11-04

**Done**
- Landing page (live Mapbox satellite hero that flies down to the address, aligned before/after demo,
  how it works, bilingual + location sections), studio, buyer share page, EN / 中文 toggle.
- Address → geocode, Orange County assessor parcel (real geometry, reconciled to the listed lot
  size), nearby places — geocoding, suggestions and places all on Mapbox.
- Zillow (autocomplete → zpid → `__NEXT_DATA__` gdpClientCache) and Redfin (Google via
  ScraperAPI → property page → only this home's own photos) listing photos, copied into Blob.
- Render API: redesign (8 directions from boardc3/sceneit), relight + photo finish only, and
  feedback edits; Template G structure/view locks; automatic overlay check with one refire.
- Email capture on every submission (address search, photo upload, render, change request) →
  Neon `leads` + `submissions`. Sign-in / create-account placeholders (UI, `api/auth.js`, `users`
  table) — not wired.
- Camera capture and uploads (shrunk in the browser to 2048 px), PWA manifest.

**Owed**
- Live test of Gemini, Maps and the share flow once the keys are in Vercel (the build session
  had no Google key; rendering was tested end to end against a mocked model response).
- Live test of Mapbox with a real token: geocoding and nearby-place parsing were tested against
  sample Mapbox v6 / Search Box responses, and the maps were checked only in their no-token state.
- ScraperAPI was reachable from the build workspace at first, then refused by its egress policy,
  so Zillow/Redfin parsing was verified against real pages fetched earlier, not live. Check one
  listed address on the deployed site.
- Parcel outlines for counties beyond Orange County (`api/_lib/parcel.js`, `PROVIDERS`).
- Accounts (see "Sign-ups" below).

## Environment (Vercel → Project → Settings → Environment Variables)

| variable | what it powers | needed |
|---|---|---|
| `GOOGLE_API_KEY` | Nano Banana Flash renders (Generative Language API) | yes |
| `MAPBOX_TOKEN` | the maps, address suggestions, geocoding and nearby places. A **public** token (`pk.…`) — the browser receives it, so restrict it in Mapbox to `localhost` and your Vercel domains | yes |
| `MAPBOX_PERMANENT_GEOCODING` | set to `1` once the Mapbox account has permanent geocoding; Mapbox's terms require it for addresses you store (share links) | before launch |
| `SCRAPERAPI_KEY` | Zillow / Redfin listing photos and facts | for listing photos |
| `DATABASE_URL` | Neon Postgres (added automatically by Vercel → Storage → Neon): everything below, plus images when Blob is not set up | yes |
| `BLOB_READ_WRITE_TOKEN` | optional: Vercel Blob for images. When present, new images go to Blob and Neon keeps only the records | no |
| `GEMINI_IMAGE_MODEL` | optional override, default `gemini-3.1-flash-image` (falls back to `-preview`) | no |
| `GEMINI_IMAGE_SIZE` | optional, default `2K` | no |

Tables create themselves on first use. `/api/health` shows which features are switched on.
Maps are Mapbox GL JS (`mapbox-gl` 3.33.0, its own lazily loaded chunk), with the token served from
`/api/health` so it can change in Vercel without a rebuild. This replaces doc 07's keyless
Leaflet/Esri rule for this project, at Chris's request (2026-11-04).

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

Only the email that created a property can overwrite its snapshot. Images in Neon cost about
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
deploys the folder directly), and prints `LIVE:` only when https://sceneshare.vercel.app answers
200. Add the environment variables above in Vercel before the first real use, then redeploy once
(Vercel → Deployments → Redeploy) so the functions see them.

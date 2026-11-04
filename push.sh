#!/bin/bash
# Sceneshare — ship it. Run on Chris's Mac (the sandbox has no git/gh/vercel auth).
#
#   bash push.sh "what changed"
#
# v2 (2026-09-15). Twice a push "went nowhere": `vercel git connect` did not actually connect the
# repo, the script trusted it, and the site sat at DEPLOYMENT_NOT_FOUND. This version verifies
# every step against reality and only prints "live" when the URL answers 200:
#   1. commit + push to github.com/boardc3/$SLUG        (creates the repo on the first run)
#   2. a Vercel project named $SLUG, linked to this folder  (creates it on the first run)
#   3. the GitHub repo connected to that project — checked through the Vercel API, not assumed
#   4. a production deployment OF THIS COMMIT — waits for the push-triggered build; if none
#      appears (connection missing or broken) it deploys the folder directly: vercel deploy --prod --yes
#   5. https://$SLUG.vercel.app returns 200, or the script exits 1 and says what to do next.
set -uo pipefail
export CI=1                          # non-interactive CLIs
SLUG=sceneshare                        # GitHub repo + Vercel project name -> github.com/boardc3/$SLUG
DIR="$HOME/Sceneshare/repo"                        # folder holding the ROOT vercel.json
GH_USER=boardc3
URL="https://sceneshare.app"
MSG="${1:-update}"

say()  { printf '· %s\n' "$*"; }
warn() { printf '!  %s\n' "$*"; }
die()  { printf '\n!! %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is not installed  ->  $2"; }

cd "$DIR" || die "no such folder: $DIR"
need git "xcode-select --install"; need gh "brew install gh"; need vercel "npm i -g vercel"; need python3 "xcode-select --install"
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not logged in  ->  gh auth login"
vercel whoami   >/dev/null 2>&1 || die "Vercel CLI is not logged in  ->  vercel login"

# ---------------------------------------------------------------- 1. commit + push
rm -f .git/*.lock 2>/dev/null || true            # stale locks from sandbox commits
[ -d .git ] || git init -b main
git add -A
if git commit -q -m "$MSG" 2>/dev/null; then say "committed: $MSG"; else say "nothing new to commit"; fi
[ -z "$(git status --porcelain)" ] || warn "uncommitted changes remain — git commit failed? run  git status  and look"
if ! git remote get-url origin >/dev/null 2>&1; then
  say "creating github.com/$GH_USER/$SLUG"
  gh repo create "$GH_USER/$SLUG" --private --source=. --remote=origin --push >/dev/null 2>&1 \
    || git remote add origin "https://github.com/$GH_USER/$SLUG.git" 2>/dev/null \
    || git remote set-url origin "https://github.com/$GH_USER/$SLUG.git"
fi
git push -u origin main || die "git push failed — read the git error above, then rerun:  bash push.sh"
HEAD=$(git rev-parse HEAD)
say "on GitHub: $GH_USER/$SLUG @ ${HEAD:0:7}"

# ---------------------------------------------------------------- 2. Vercel project
if [ ! -f .vercel/project.json ]; then
  say "creating + linking the Vercel project '$SLUG'"
  vercel link --yes --project "$SLUG" >/dev/null 2>&1 || die "vercel link failed — run  vercel link --yes --project $SLUG  by hand and read its output"
fi
PROJECT_ID=$(python3 -c 'import json;print(json.load(open(".vercel/project.json"))["projectId"])')
TEAM_ID=$(python3 -c 'import json;print(json.load(open(".vercel/project.json")).get("orgId") or "")')

# the API token the Vercel CLI already holds (macOS path first, then Linux)
TOKEN=${VERCEL_TOKEN:-$(python3 - <<'EOF'
import json, os
for p in ("~/Library/Application Support/com.vercel.cli/auth.json",
          "~/.local/share/com.vercel.cli/auth.json", "~/.config/com.vercel.cli/auth.json",
          "~/.vercel/auth.json", "~/.now/auth.json"):
    p = os.path.expanduser(p)
    if os.path.exists(p):
        try:
            print(json.load(open(p)).get("token", "")); break
        except Exception:
            pass
EOF
)}
api() {   # api /v9/projects/ID   or   api "/v6/deployments?x=y"   (teamId appended either way)
  local q="$1" sep='?'
  case "$q" in *\?*) sep='&';; esac
  [ -n "$TEAM_ID" ] && q="$q${sep}teamId=$TEAM_ID"
  curl -sS -m 30 -H "Authorization: Bearer $TOKEN" "https://api.vercel.com$q"
}
linked_repo() {   # prints owner/repo, "" when not connected, "?" when it cannot tell
  [ -n "$TOKEN" ] || { echo "?"; return; }
  api "/v9/projects/$PROJECT_ID" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin); l = d.get("link") or {}
    print(l.get("repo") and ("%s/%s" % (l.get("org") or l.get("owner") or "", l.get("repo"))) or "")
except Exception:
    print("?")'
}
latest_ready_sha() {   # sha of the newest READY production deployment ("" if none / unknown)
  [ -n "$TOKEN" ] || { echo ""; return; }
  api "/v6/deployments?projectId=$PROJECT_ID&target=production&state=READY&limit=1" | python3 -c '
import json, sys
try:
    d = json.load(sys.stdin)["deployments"][0]; print(d.get("meta", {}).get("githubCommitSha", ""))
except Exception:
    print("")'
}
http() { curl -sS -o /dev/null -w '%{http_code}' -m 20 "$1/" 2>/dev/null || echo 000; }

# ---------------------------------------------------------------- 3. GitHub <-> Vercel connection
LINK=$(linked_repo)
if [ -z "$LINK" ]; then
  say "connecting github.com/$GH_USER/$SLUG to the Vercel project"
  vercel git connect --yes "https://github.com/$GH_USER/$SLUG" >/dev/null 2>&1 \
    || vercel git connect --yes >/dev/null 2>&1 || true
  LINK=$(linked_repo)
fi
case "$LINK" in
  "")  warn "the Vercel project is NOT git-connected: pushes alone will not deploy."
       warn "fix once:  vercel.com -> $SLUG -> Settings -> Git -> Connect Git Repository -> $GH_USER/$SLUG"
       warn "until then this script deploys the folder directly (below), so the site still goes live." ;;
  "?") warn "could not verify the Git connection (no Vercel API token found) — will deploy directly if the push does not." ;;
  *)   say "Vercel project is connected to $LINK" ;;
esac

# ---------------------------------------------------------------- 4. this commit must be live
deployed=""
if [ -n "$LINK" ] && [ "$LINK" != "?" ]; then
  say "waiting for the push-triggered production build (up to 4 min) ..."
  for i in $(seq 1 48); do
    sha=$(latest_ready_sha)
    if [ "$sha" = "$HEAD" ]; then deployed=git; break; fi
    sleep 5
  done
fi
if [ -z "$deployed" ]; then
  say "deploying the folder directly:  vercel deploy --prod --yes"
  out=$(vercel deploy --prod --yes 2>&1) || { printf '%s\n' "$out" | tail -20; die "vercel deploy failed — see the output above (a login/upgrade prompt means: run  vercel deploy --prod  by hand once)"; }
  deployed=cli
fi

# ---------------------------------------------------------------- 5. prove it
for i in $(seq 1 24); do
  code=$(http "$URL")
  [ "$code" = "200" ] && break
  sleep 5
done
if [ "$code" = "200" ]; then
  say "LIVE: $URL   (deployed via $deployed; github.com/$GH_USER/$SLUG @ ${HEAD:0:7})"
  [ "$deployed" = cli ] && [ -z "$LINK" ] && warn "remember: connect Git in the Vercel dashboard so future pushes deploy on their own."
  exit 0
fi
die "$URL answers HTTP $code. The deployment exists in the dashboard (vercel.com -> $SLUG -> Deployments) — open the newest one and read its build log; then rerun  bash push.sh"

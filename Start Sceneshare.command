#!/bin/zsh
# Sceneshare — start the app locally for review. Double-click this file in Finder.
# It makes sure Node 22 is in use (Vite 8 needs Node 20.19+), installs once, then
# opens http://localhost:5173. Close the Terminal window to stop it.
cd "${0:A:h}" || exit 1
echo "Sceneshare — local review"

# API keys (GOOGLE_API_KEY, GOOGLE_MAPS_API_KEY, SCRAPERAPI_KEY) come from your shell profile
# or from .env.local in this folder.
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" >/dev/null 2>&1

ok_node() {
  command -v node >/dev/null 2>&1 && node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit((a===20&&b>=19)||(a===22&&b>=12)||a>=23?0:1)'
}

if ! ok_node; then
  echo "Node $(node -v 2>/dev/null || echo 'not found') is too old for this app. Switching to Node 22."
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  if command -v nvm >/dev/null 2>&1; then
    nvm install 22 && nvm use 22
  elif command -v brew >/dev/null 2>&1; then
    brew install node@22 && export PATH="$(brew --prefix node@22)/bin:$PATH"
  fi
fi
if ! ok_node; then
  echo "Could not switch to Node 22. Install it from https://nodejs.org, then double-click this file again."
  read -k1 "?Press any key to close."
  exit 1
fi
echo "Using Node $(node -v)"

# Reinstall when the Mac-specific build tools are missing (an install made with an older Node)
# or when the dependencies changed since the last install.
if { [ ! -d node_modules/@rolldown/binding-darwin-arm64 ] && [ ! -d node_modules/@rolldown/binding-darwin-x64 ]; } \
   || [ ! -f node_modules/.package-lock.json ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  echo "Installing dependencies…"
  rm -rf node_modules
  if ! npm ci; then
    echo "npm ci failed — see the messages above."
    read -k1 "?Press any key to close."
    exit 1
  fi
fi

npm run dev -- --open

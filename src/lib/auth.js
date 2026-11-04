// Accounts placeholder. The UI calls these; they resolve to "not available" until
// a provider is wired in. Replace the bodies, keep the signatures.
export const auth = {
  user: null,
  available: false,
  async signIn() {
    return { ok: false, reason: 'accounts_coming_soon' }
  },
  async signUp() {
    return { ok: false, reason: 'accounts_coming_soon' }
  },
  async signOut() {
    return { ok: true }
  },
}

import { send } from './_lib/http.js'

// Placeholder for accounts. The UI shows "Sign in" / "Create account" and lands
// here; wire a provider (Clerk, Auth.js, Neon Auth, Supabase) and replace this.
// The `users` table already exists in api/_lib/db.js.
export default async function handler(_req, res) {
  send(res, 501, {
    ok: false,
    error: 'accounts_coming_soon',
    message: 'Accounts are not open yet. Your email is saved, and we will invite you when they are.',
  })
}

import type { AppUser } from '../types/user'

/** Resolves a "Bruno"/"Ciane"/"Nicolas"/"Jamilson"-style first name (as used
 *  throughout the onboarding templates and notification triggers) to a real
 *  uid — case-insensitive, matches on first name. Returns undefined if that
 *  person doesn't have a CRM account yet (see README: accounts are created
 *  manually in the Firebase Console) — callers should just skip that
 *  recipient rather than fail. */
export function findUserIdByName(users: AppUser[], name: string): string | undefined {
  return users.find((u) => u.name.toLowerCase().includes(name.toLowerCase()))?.id
}

/** Every internal team member (i.e. not a client-portal account), active
 *  only — used for "notify everyone" events like a new client being
 *  registered or a meeting being scheduled. */
export function getInternalStaffIds(users: AppUser[]): string[] {
  return users.filter((u) => u.role !== 'client' && u.active).map((u) => u.id)
}

const OWNER_EMAIL = 'gestorarrowshotmkt@gmail.com'

/** Platform owner/admin ids from an already-loaded users list — the `admin`
 *  role, plus the owner by e-mail as a fallback. */
export function resolveAdminIds(users: AppUser[]): string[] {
  return users
    .filter((u) => u.active && (u.role === 'admin' || u.email === OWNER_EMAIL))
    .map((u) => u.id)
}

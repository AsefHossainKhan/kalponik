import { isValidEmail, normalizeEmail } from '@/libs/invites';

// Who may open /admin (invite-only sign-up, server side).
//
// Root admins are named in the server setting KALPONIK_ADMINS: a comma-
// separated list of emails or Supabase user ids. They can't be removed from
// the app, so a root admin can't be locked out. Any admin can add more admins
// (existing accounts, by email) or remove added ones; those live in the
// `admins` table (migration 035).

export interface AdminRow {
  user_id: string;
  added_by: string | null;
  created_at: string;
}

export interface AdminStore {
  list(): Promise<AdminRow[]>;
  has(userId: string): Promise<boolean>;
  add(userId: string, addedBy: string, now: Date): Promise<void>;
  /** False when there was no such admin. */
  remove(userId: string): Promise<boolean>;
}

export interface DirectoryUser {
  id: string;
  email: string | null;
}

export interface UserDirectory {
  findByEmail(email: string): Promise<DirectoryUser | null>;
  getById(id: string): Promise<DirectoryUser | null>;
}

export interface Caller {
  id: string;
  email?: string | null;
}

export type AdminError =
  | 'invalid_email'
  | 'no_account'
  | 'already_admin'
  | 'root_admin'
  | 'self'
  | 'not_admin';

const rootAdminEntries = (env: string | undefined) =>
  (env ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const isRootAdmin = (user: Caller, env: string | undefined) => {
  const entries = rootAdminEntries(env);
  const email = user.email ? normalizeEmail(user.email) : '';
  return (
    (!!user.id && entries.includes(user.id.toLowerCase())) || (!!email && entries.includes(email))
  );
};

export async function isAdmin(store: AdminStore, user: Caller, env: string | undefined) {
  if (!user.id) return false;
  return isRootAdmin(user, env) || store.has(user.id);
}

export async function addAdmin(
  store: AdminStore,
  users: UserDirectory,
  actor: Caller,
  email: string,
  now: Date,
  env?: string,
): Promise<{ ok: true } | { ok: false; error: AdminError }> {
  const wanted = normalizeEmail(email ?? '');
  if (!isValidEmail(wanted)) return { ok: false, error: 'invalid_email' };
  const user = await users.findByEmail(wanted);
  if (!user) return { ok: false, error: 'no_account' };
  if (isRootAdmin(user, env) || (await store.has(user.id))) {
    return { ok: false, error: 'already_admin' };
  }
  await store.add(user.id, actor.id, now);
  return { ok: true };
}

export async function removeAdmin(
  store: AdminStore,
  users: UserDirectory,
  actor: Caller,
  userId: string,
  env: string | undefined,
): Promise<{ ok: true } | { ok: false; error: AdminError }> {
  if (userId === actor.id) return { ok: false, error: 'self' };
  const target = (await users.getById(userId)) ?? { id: userId, email: null };
  if (isRootAdmin(target, env)) return { ok: false, error: 'root_admin' };
  return (await store.remove(userId)) ? { ok: true } : { ok: false, error: 'not_admin' };
}

export interface AdminListEntry {
  /** Null for a root admin named by an email that has no account yet. */
  id: string | null;
  email: string | null;
  root: boolean;
  addedAt: string | null;
}

export async function listAdmins(
  store: AdminStore,
  users: UserDirectory,
  env: string | undefined,
): Promise<AdminListEntry[]> {
  const roots: AdminListEntry[] = [];
  for (const entry of rootAdminEntries(env)) {
    const user = entry.includes('@') ? await users.findByEmail(entry) : await users.getById(entry);
    roots.push({
      id: user?.id ?? (entry.includes('@') ? null : entry),
      email: user?.email ?? (entry.includes('@') ? entry : null),
      root: true,
      addedAt: null,
    });
  }
  const rootIds = new Set(roots.map((o) => o.id));
  const added: AdminListEntry[] = [];
  for (const row of await store.list()) {
    if (rootIds.has(row.user_id)) continue;
    const user = await users.getById(row.user_id);
    added.push({
      id: row.user_id,
      email: user?.email ?? null,
      root: false,
      addedAt: row.created_at,
    });
  }
  return [...roots, ...added];
}

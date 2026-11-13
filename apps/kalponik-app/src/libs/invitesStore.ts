import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import type { AccountService, InviteDeps, InviteRow, InviteStore } from '@/libs/invites';
import { KALPONIK_APK_URL, type InviteLinks } from '@/libs/inviteMail';
import { createSmtpMailer } from '@/libs/mailer';
import { getBaseUrl } from '@/services/environment';
import {
  isAdmin,
  type AdminRow,
  type AdminStore,
  type Caller,
  type UserDirectory,
} from '@/libs/admins';

// The Supabase side of invite-only sign-up: the `invites`, `admins` and
// `admin_prefs` tables (migrations 034-036) and accounts through the Auth
// admin API.
// Server only: all of it needs the service-role key.

/** The server setting naming the root admin(s): emails or user ids, comma-separated. */
export const getRootAdminsSetting = () => process.env['KALPONIK_ADMINS'];

export const createSupabaseAdminStore = (): AdminStore => {
  const db = createSupabaseAdminClient();
  return {
    async list() {
      const { data, error } = await db
        .from('admins')
        .select('user_id, added_by, created_at')
        .order('created_at', { ascending: true });
      if (error) fail('list admins', error);
      return (data as AdminRow[]) ?? [];
    },
    async has(userId) {
      const { count, error } = await db
        .from('admins')
        .select('user_id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (error) fail('check admin', error);
      return (count ?? 0) > 0;
    },
    async add(userId, addedBy, now) {
      const { error } = await db
        .from('admins')
        .insert({ user_id: userId, added_by: addedBy, created_at: now.toISOString() });
      if (error) fail('add admin', error);
    },
    async remove(userId) {
      const { data, error } = await db
        .from('admins')
        .delete()
        .eq('user_id', userId)
        .select('user_id');
      if (error) fail('remove admin', error);
      return (data ?? []).length > 0;
    },
  };
};

export const createSupabaseUserDirectory = (): UserDirectory => {
  const db = createSupabaseAdminClient();
  return {
    async findByEmail(email) {
      // The Auth admin API has no lookup by email; a Kalponik project has a
      // handful of users, so page through them.
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
        if (error) fail('list users', error);
        const match = data.users.find((u) => u.email?.toLowerCase() === email);
        if (match) return { id: match.id, email: match.email ?? null };
        if (data.users.length < 200) break;
      }
      return null;
    },
    async getById(id) {
      const { data, error } = await db.auth.admin.getUserById(id);
      if (error || !data.user) return null;
      return { id: data.user.id, email: data.user.email ?? null };
    },
  };
};

/**
 * The signed-in admin making this request, or null after answering 401/403.
 * Root admins come from the server setting, other admins from the `admins` table.
 */
export const requireAdmin = async (
  req: NextApiRequest,
  res: NextApiResponse,
): Promise<Caller | null> => {
  const { user } = await validateUserAndToken(req.headers['authorization']);
  if (!user) {
    res.status(401).json({ error: 'not_authenticated' });
    return null;
  }
  const caller: Caller = { id: user.id, email: (user.email as string | undefined) ?? null };
  if (!(await isAdmin(createSupabaseAdminStore(), caller, getRootAdminsSetting()))) {
    res.status(403).json({ error: 'not_admin' });
    return null;
  }
  return caller;
};

const TABLE = 'invites';

const fail = (what: string, error: { message: string }): never => {
  throw new Error(`invites: ${what} failed: ${error.message}`);
};

export const createSupabaseInviteStore = (): InviteStore => {
  const db = createSupabaseAdminClient();
  return {
    async insert(row) {
      const { data, error } = await db.from(TABLE).insert(row).select('*').single();
      if (error) fail('insert', error);
      return data as InviteRow;
    },
    async findByTokenHash(hash) {
      const { data, error } = await db.from(TABLE).select('*').eq('token_hash', hash).maybeSingle();
      if (error) fail('lookup', error);
      return (data as InviteRow | null) ?? null;
    },
    async findByVerifyHash(hash) {
      const { data, error } = await db
        .from(TABLE)
        .select('*')
        .eq('verify_hash', hash)
        .maybeSingle();
      if (error) fail('lookup', error);
      return (data as InviteRow | null) ?? null;
    },
    async findById(id) {
      const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (error) fail('lookup', error);
      return (data as InviteRow | null) ?? null;
    },
    async update(id, patch) {
      const { data, error } = await db
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .select('*')
        .maybeSingle();
      if (error) fail('update', error);
      return (data as InviteRow | null) ?? null;
    },
    async claimActivation(id, at) {
      const { data, error } = await db
        .from(TABLE)
        .update({ activated_at: at })
        .eq('id', id)
        .is('activated_at', null)
        .select('id');
      if (error) fail('activate', error);
      return (data ?? []).length > 0;
    },
    async updateIfStatus(id, expected, patch) {
      const { data, error } = await db
        .from(TABLE)
        .update(patch)
        .eq('id', id)
        .eq('status', expected)
        .select('*')
        .maybeSingle();
      if (error) fail('update', error);
      return (data as InviteRow | null) ?? null;
    },
    async countRecentFromIp(ipHash, since) {
      const { count, error } = await db
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', since.toISOString());
      if (error) fail('count', error);
      return count ?? 0;
    },
    async countPendingRequests() {
      const { count, error } = await db
        .from(TABLE)
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'request')
        .eq('status', 'pending');
      if (error) fail('count', error);
      return count ?? 0;
    },
    async listRecent() {
      const { data, error } = await db
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) fail('list', error);
      return (data as InviteRow[]) ?? [];
    },
  };
};

// Ten years: Supabase Auth has no "locked" flag, so a long ban stands in.
const LOCKED = '87600h';

export const createSupabaseAccountService = (): AccountService => {
  const db = createSupabaseAdminClient();
  return {
    async createLocked({ email, password }) {
      // Locked and unconfirmed until the email is verified and the invite
      // approved (invites.ts). A Google sign-in with the same verified
      // address later links to this account.
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: false,
        ban_duration: LOCKED,
      });
      if (error || !data.user) {
        const code = (error as { code?: string } | null)?.code;
        if (code === 'email_exists' || code === 'user_already_exists') {
          return { ok: false, error: 'account_exists' };
        }
        if (code === 'weak_password') return { ok: false, error: 'weak_password' };
        console.error('invites: createUser failed', code, error?.message);
        return { ok: false, error: 'create_failed' };
      }
      return { ok: true, userId: data.user.id };
    },
    async activate(userId) {
      const { error } = await db.auth.admin.updateUserById(userId, {
        ban_duration: 'none',
        email_confirm: true,
      });
      if (error) console.error('invites: unlocking the account failed', error.message);
      return !error;
    },
    async remove(userId) {
      const { error } = await db.auth.admin.deleteUser(userId);
      if (error) console.error('invites: removing the locked account failed', error.message);
    },
  };
};

/** Each admin's own settings (migration 036). */
export interface AdminPrefs {
  notifyRequests: boolean;
}

export const createSupabaseAdminPrefs = () => {
  const db = createSupabaseAdminClient();
  return {
    async get(userId: string): Promise<AdminPrefs> {
      const { data, error } = await db
        .from('admin_prefs')
        .select('notify_requests')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) fail('read admin prefs', error);
      return { notifyRequests: !!data?.notify_requests };
    },
    async set(userId: string, prefs: AdminPrefs) {
      const { error } = await db.from('admin_prefs').upsert({
        user_id: userId,
        notify_requests: prefs.notifyRequests,
        updated_at: new Date().toISOString(),
      });
      if (error) fail('save admin prefs', error);
    },
    async watcherIds(): Promise<string[]> {
      const { data, error } = await db
        .from('admin_prefs')
        .select('user_id')
        .eq('notify_requests', true);
      if (error) fail('list admin prefs', error);
      return (data ?? []).map((r) => r.user_id as string);
    },
  };
};

/** Emails of the admins who turned on "Email me about new requests". */
const requestWatchers = async () => {
  const ids = await createSupabaseAdminPrefs().watcherIds();
  const directory = createSupabaseUserDirectory();
  const admins = createSupabaseAdminStore();
  const emails: string[] = [];
  for (const id of ids) {
    const user = await directory.getById(id);
    // Someone who stopped being an admin keeps their row; skip them.
    if (user?.email && (await isAdmin(admins, user, getRootAdminsSetting()))) {
      emails.push(user.email);
    }
  }
  return emails;
};

/** Where the emails point: the web app the API is served from (API_BASE_URL). */
export const getInviteLinks = (): InviteLinks => ({
  webUrl: getBaseUrl().replace(/\/+$/, ''),
  apkUrl: KALPONIK_APK_URL,
});

export const createInviteDeps = (): InviteDeps => ({
  store: createSupabaseInviteStore(),
  accounts: createSupabaseAccountService(),
  mailer: createSmtpMailer(),
  links: getInviteLinks(),
  requestWatchers,
});

/**
 * The client's address as nginx saw it. nginx appends that address to
 * X-Forwarded-For, so it is the last entry; earlier entries come from the
 * client and could be anything it likes.
 */
export const getClientIp = (req: NextApiRequest) => {
  const forwarded = req.headers['x-forwarded-for'];
  const header = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  const last = header?.split(',').pop()?.trim();
  return last || req.socket?.remoteAddress || 'unknown';
};

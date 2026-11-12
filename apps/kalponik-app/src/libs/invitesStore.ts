import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseAdminClient } from '@/utils/supabase';
import { validateUserAndToken } from '@/utils/access';
import type { AccountCreator, InviteRow, InviteStore } from '@/libs/invites';
import {
  isAdmin,
  type AdminRow,
  type AdminStore,
  type Caller,
  type UserDirectory,
} from '@/libs/admins';

// The Supabase side of invite-only sign-up: the `invites` and `admins`
// tables (migrations 034, 035) and accounts through the Auth admin API.
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
    async findById(id) {
      const { data, error } = await db.from(TABLE).select('*').eq('id', id).maybeSingle();
      if (error) fail('lookup', error);
      return (data as InviteRow | null) ?? null;
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

export const createSupabaseAccountCreator = (): AccountCreator => {
  const db = createSupabaseAdminClient();
  return {
    async createUser({ email, password }) {
      // email_confirm: the invite stands in for email confirmation. A Google
      // sign-in with the same verified address later links to this account.
      const { data, error } = await db.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
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
  };
};

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

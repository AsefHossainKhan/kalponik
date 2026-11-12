// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  APPROVED_REQUEST_TTL_MS,
  INVITE_LINK_TTL_MS,
  MAX_PENDING_REQUESTS,
  REQUEST_RATE_LIMIT,
  createInviteLink,
  decideInvite,
  getInviteStatus,
  hashInviteCode,
  joinWithInvite,
  listInvitesForAdmin,
  requestAccess,
  type AccountCreator,
  type InviteRow,
  type InviteStore,
} from '@/libs/invites';

// Invite-only sign-up: Supabase sign-up is off and the server creates every
// account. These cover the rules an invite row enforces: who may create an
// account, with which email, once, and before it expires.

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-11-12T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const memoryStore = (): InviteStore & { rows: InviteRow[] } => {
  const rows: InviteRow[] = [];
  return {
    rows,
    async insert(row) {
      const full: InviteRow = { id: `i${rows.length + 1}`, created_at: T0.toISOString(), ...row };
      rows.push(full);
      return { ...full };
    },
    async findByTokenHash(hash) {
      const row = rows.find((r) => r.token_hash === hash);
      return row ? { ...row } : null;
    },
    async findById(id) {
      const row = rows.find((r) => r.id === id);
      return row ? { ...row } : null;
    },
    async updateIfStatus(id, expected, patch) {
      const row = rows.find((r) => r.id === id && r.status === expected);
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async countRecentFromIp(ipHash, since) {
      return rows.filter((r) => r.ip_hash === ipHash && r.created_at >= since.toISOString()).length;
    },
    async countPendingRequests() {
      return rows.filter((r) => r.kind === 'request' && r.status === 'pending').length;
    },
    async listRecent() {
      return rows.map((r) => ({ ...r }));
    },
  };
};

const accounts = () => {
  const users = new Map<string, { password?: string }>();
  const creator: AccountCreator & { users: typeof users } = {
    users,
    async createUser({ email, password }) {
      if (users.has(email)) return { ok: false, error: 'account_exists' };
      users.set(email, { password });
      return { ok: true, userId: `u-${email}` };
    },
  };
  return creator;
};

let store: ReturnType<typeof memoryStore>;
let users: ReturnType<typeof accounts>;

beforeEach(() => {
  store = memoryStore();
  users = accounts();
});

describe('invite links', () => {
  it('creates an approved link and stores only the hash of its code', async () => {
    const { code } = await createInviteLink(store, { note: 'for Nila' }, T0);
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(store.rows[0]!.token_hash).toBe(hashInviteCode(code));
    expect(JSON.stringify(store.rows)).not.toContain(code);
    const status = await getInviteStatus(store, code, T0);
    expect(status).toEqual({
      ok: true,
      kind: 'link',
      state: 'approved',
      email: null,
      expiresAt: at(INVITE_LINK_TTL_MS).toISOString(),
    });
  });

  it('creates exactly one account, with any email, then is used up', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    const joined = await joinWithInvite(
      store,
      users,
      { code, email: ' Friend@Example.com ', password: 'long enough pw' },
      at(HOUR),
    );
    expect(joined).toEqual({
      ok: true,
      email: 'friend@example.com',
      userId: 'u-friend@example.com',
    });
    expect(users.users.get('friend@example.com')).toEqual({ password: 'long enough pw' });
    expect(store.rows[0]).toMatchObject({ status: 'used', used_by: 'u-friend@example.com' });

    const again = await joinWithInvite(
      store,
      users,
      { code, email: 'other@example.com', password: 'long enough pw' },
      at(HOUR),
    );
    expect(again).toEqual({ ok: false, error: 'used' });
    expect(users.users.has('other@example.com')).toBe(false);
  });

  it('creates a Google account without a password', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    const joined = await joinWithInvite(store, users, { code, email: 'g@gmail.com' }, T0);
    expect(joined.ok).toBe(true);
    expect(users.users.get('g@gmail.com')).toEqual({ password: undefined });
  });

  it('refuses an expired link', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    const later = at(INVITE_LINK_TTL_MS + 1);
    expect(await getInviteStatus(store, code, later)).toMatchObject({ state: 'expired' });
    expect(
      await joinWithInvite(
        store,
        users,
        { code, email: 'a@b.co', password: 'long enough pw' },
        later,
      ),
    ).toEqual({ ok: false, error: 'expired' });
  });

  it('refuses a revoked link', async () => {
    const { code, invite } = await createInviteLink(store, {}, T0);
    expect(await decideInvite(store, invite.id, 'revoke', T0)).toEqual({ ok: true });
    expect(
      await joinWithInvite(store, users, { code, email: 'a@b.co', password: 'long enough pw' }, T0),
    ).toEqual({ ok: false, error: 'revoked' });
  });

  it('gives the link back when the account already exists', async () => {
    users.users.set('taken@example.com', {});
    const { code } = await createInviteLink(store, {}, T0);
    expect(
      await joinWithInvite(
        store,
        users,
        { code, email: 'taken@example.com', password: 'long enough pw' },
        T0,
      ),
    ).toEqual({ ok: false, error: 'account_exists' });
    expect(store.rows[0]).toMatchObject({ status: 'approved', used_at: null, email: null });
  });

  it('rejects malformed codes, bad emails and short passwords', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    expect(await getInviteStatus(store, 'nope', T0)).toEqual({ ok: false, error: 'invalid_code' });
    expect(await getInviteStatus(store, 'x'.repeat(32), T0)).toEqual({
      ok: false,
      error: 'invalid_code',
    });
    expect(
      await joinWithInvite(
        store,
        users,
        { code, email: 'not-an-email', password: 'long pw!!' },
        T0,
      ),
    ).toEqual({ ok: false, error: 'invalid_email' });
    expect(
      await joinWithInvite(store, users, { code, email: 'a@b.co', password: 'short' }, T0),
    ).toEqual({ ok: false, error: 'weak_password' });
    expect(store.rows[0]!.status).toBe('approved');
  });
});

describe('access requests', () => {
  const ask = (email: string, ip = 'ip-1', when = T0, website = '') =>
    requestAccess(store, { email, note: 'hi, it is Rafi', ipHash: ip, website }, when);

  it('starts pending and cannot be used until approved', async () => {
    const res = await ask('rafi@example.com');
    if (!res.ok) throw new Error(res.error);
    expect(await getInviteStatus(store, res.code, T0)).toMatchObject({
      kind: 'request',
      state: 'pending',
      email: 'rafi@example.com',
      expiresAt: null,
    });
    expect(
      await joinWithInvite(store, users, { code: res.code, email: 'rafi@example.com' }, T0),
    ).toEqual({ ok: false, error: 'not_approved' });
  });

  it('after approval creates the account for the requested email only', async () => {
    const res = await ask('rafi@example.com');
    if (!res.ok) throw new Error(res.error);
    const id = store.rows[0]!.id;
    expect(await decideInvite(store, id, 'approve', at(HOUR))).toEqual({ ok: true });
    expect(await getInviteStatus(store, res.code, at(HOUR))).toMatchObject({
      state: 'approved',
      expiresAt: at(HOUR + APPROVED_REQUEST_TTL_MS).toISOString(),
    });
    expect(
      await joinWithInvite(store, users, { code: res.code, email: 'someone@else.com' }, at(HOUR)),
    ).toEqual({ ok: false, error: 'email_mismatch' });
    expect(
      await joinWithInvite(store, users, { code: res.code, email: 'RAFI@example.com' }, at(HOUR)),
    ).toMatchObject({ ok: true, email: 'rafi@example.com' });
  });

  it('can be declined, and a decided request cannot be decided again', async () => {
    const res = await ask('rafi@example.com');
    if (!res.ok) throw new Error(res.error);
    const id = store.rows[0]!.id;
    expect(await decideInvite(store, id, 'decline', T0)).toEqual({ ok: true });
    expect(await getInviteStatus(store, res.code, T0)).toMatchObject({ state: 'declined' });
    expect(await decideInvite(store, id, 'approve', T0)).toEqual({ ok: false, error: 'bad_state' });
    expect(await decideInvite(store, 'missing', 'approve', T0)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('limits requests per IP per hour and the number pending', async () => {
    for (let i = 0; i < REQUEST_RATE_LIMIT; i++) {
      expect((await ask(`p${i}@example.com`)).ok).toBe(true);
    }
    expect(await ask('one-more@example.com')).toEqual({ ok: false, error: 'rate_limited' });
    expect((await ask('next-hour@example.com', 'ip-1', at(HOUR + 1))).ok).toBe(true);

    for (let i = store.rows.length; i < MAX_PENDING_REQUESTS; i++) {
      store.rows.push({ ...store.rows[0]!, id: `fill${i}`, token_hash: `h${i}`, ip_hash: `x${i}` });
    }
    expect(await ask('late@example.com', 'ip-2')).toEqual({ ok: false, error: 'too_many_pending' });
  });

  it('pretends to accept a bot that fills the hidden field, and stores nothing', async () => {
    const res = await ask('bot@example.com', 'ip-9', T0, 'https://spam.example');
    expect(res.ok).toBe(true);
    expect(store.rows).toHaveLength(0);
  });

  it('rejects an invalid email and an overlong note', async () => {
    expect(await ask('nope')).toEqual({ ok: false, error: 'invalid_email' });
    expect(
      await requestAccess(
        store,
        { email: 'a@b.co', note: 'x'.repeat(501), ipHash: 'ip', website: '' },
        T0,
      ),
    ).toEqual({ ok: false, error: 'note_too_long' });
  });
});

describe('admin', () => {
  it('lists pending requests and usable invites, never token hashes', async () => {
    await requestAccess(
      store,
      { email: 'r@example.com', note: null, ipHash: 'ip', website: '' },
      T0,
    );
    await createInviteLink(store, { note: 'cousin' }, T0);
    const old = await createInviteLink(store, {}, T0);
    await decideInvite(store, old.invite.id, 'revoke', T0);
    const list = await listInvitesForAdmin(store, at(HOUR));
    expect(list.pending.map((r) => r.email)).toEqual(['r@example.com']);
    expect(list.active.map((r) => r.note)).toEqual(['cousin']);
    expect(list.recent.map((r) => r.state)).toEqual(['revoked']);
    expect(JSON.stringify(list)).not.toContain('token_hash');
  });
});

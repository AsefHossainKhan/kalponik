// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  APPROVED_REQUEST_TTL_MS,
  INVITE_LINK_TTL_MS,
  MAX_PENDING_REQUESTS,
  REQUEST_RATE_LIMIT,
  VERIFY_RESEND_MS,
  VERIFY_TTL_MS,
  createInviteLink,
  decideInvite,
  getInviteStatus,
  hashInviteCode,
  joinWithInvite,
  listInvitesForAdmin,
  requestAccess,
  resendVerification,
  verifyEmail,
  type AccountService,
  type InviteDeps,
  type InviteRow,
  type InviteStore,
  type Mailer,
} from '@/libs/invites';
import type { MailMessage } from '@/libs/inviteMail';

// Invite-only sign-up: Supabase sign-up is off and the server creates every
// account, locked, with the password the visitor chose. It unlocks once the
// email is verified and the invite approved. These cover who may get an
// account, with which email, once, and when it unlocks.

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-11-12T10:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms);
const PW = 'long enough pw';

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
    async findByVerifyHash(hash) {
      const row = rows.find((r) => r.verify_hash === hash);
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
    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      if (!row) return null;
      Object.assign(row, patch);
      return { ...row };
    },
    async claimActivation(id, when) {
      const row = rows.find((r) => r.id === id && !r.activated_at);
      if (!row) return false;
      row.activated_at = when;
      return true;
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

interface FakeUser {
  id: string;
  password: string;
  locked: boolean;
}

const fakeAccounts = () => {
  const users = new Map<string, FakeUser>();
  const service: AccountService & { users: typeof users; byId: (id: string) => FakeUser } = {
    users,
    byId: (id) => [...users.values()].find((u) => u.id === id)!,
    async createLocked({ email, password }) {
      if (users.has(email)) return { ok: false, error: 'account_exists' };
      users.set(email, { id: `u-${email}`, password, locked: true });
      return { ok: true, userId: `u-${email}` };
    },
    async activate(userId) {
      const user = [...users.values()].find((u) => u.id === userId);
      if (!user) return false;
      user.locked = false;
      return true;
    },
    async remove(userId) {
      for (const [email, u] of users) if (u.id === userId) users.delete(email);
    },
  };
  return service;
};

const fakeMailer = (enabled = true) => {
  const sent: MailMessage[] = [];
  const mailer: Mailer & { sent: MailMessage[] } = {
    enabled,
    sent,
    async send(message) {
      sent.push(message);
      return true;
    },
  };
  return mailer;
};

/** The verification code in the last email sent to `to`. */
const tokenIn = (mailer: ReturnType<typeof fakeMailer>, to: string) => {
  const mail = [...mailer.sent].reverse().find((m) => m.to === to && /verify-email/.test(m.text));
  return mail?.text.match(/token=([A-Za-z0-9_-]{32})/)?.[1] ?? '';
};

const subjectsTo = (mailer: ReturnType<typeof fakeMailer>, to: string) =>
  mailer.sent.filter((m) => m.to === to).map((m) => m.subject);

let store: ReturnType<typeof memoryStore>;
let accounts: ReturnType<typeof fakeAccounts>;
let mailer: ReturnType<typeof fakeMailer>;
let watchers: string[];
let deps: InviteDeps;

const makeDeps = (mail = fakeMailer()) => {
  mailer = mail;
  deps = {
    store,
    accounts,
    mailer,
    links: { webUrl: 'https://example.org/kalponik', apkUrl: 'https://example.org/app.apk' },
    requestWatchers: async () => watchers,
  };
};

beforeEach(() => {
  store = memoryStore();
  accounts = fakeAccounts();
  watchers = [];
  makeDeps();
});

describe('invite links', () => {
  it('creates an approved link and stores only the hash of its code', async () => {
    const { code } = await createInviteLink(store, { note: 'for Nila' }, T0);
    expect(code).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(store.rows[0]!.token_hash).toBe(hashInviteCode(code));
    expect(JSON.stringify(store.rows)).not.toContain(code);
    expect(await getInviteStatus(store, code, T0)).toEqual({
      ok: true,
      kind: 'link',
      state: 'approved',
      email: null,
      expiresAt: at(INVITE_LINK_TTL_MS).toISOString(),
      account: null,
    });
  });

  it('joins with any email and a password; the account unlocks once the email is verified', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    const joined = await joinWithInvite(
      deps,
      { code, email: ' Friend@Outlook.com ', password: PW },
      at(HOUR),
    );
    expect(joined).toEqual({
      ok: true,
      email: 'friend@outlook.com',
      userId: 'u-friend@outlook.com',
      active: false,
    });
    expect(accounts.users.get('friend@outlook.com')).toMatchObject({ password: PW, locked: true });
    expect(await getInviteStatus(store, code, at(HOUR))).toMatchObject({
      state: 'used',
      email: 'friend@outlook.com',
      account: { verified: false, approved: true, active: false },
    });

    const token = tokenIn(mailer, 'friend@outlook.com');
    expect(await verifyEmail(deps, token, at(2 * HOUR))).toEqual({
      ok: true,
      email: 'friend@outlook.com',
      approved: true,
      active: true,
    });
    expect(accounts.users.get('friend@outlook.com')!.locked).toBe(false);
    expect(subjectsTo(mailer, 'friend@outlook.com')).toEqual([
      'Confirm your email for Kalponik',
      'Your Kalponik account is ready',
    ]);
    // Opening the link again changes nothing and sends nothing more.
    expect(await verifyEmail(deps, token, at(3 * HOUR))).toMatchObject({ ok: true, active: true });
    expect(mailer.sent).toHaveLength(2);
  });

  it('is used up after one account', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    expect(
      (await joinWithInvite(deps, { code, email: 'a@example.com', password: PW }, T0)).ok,
    ).toBe(true);
    expect(await joinWithInvite(deps, { code, email: 'b@example.com', password: PW }, T0)).toEqual({
      ok: false,
      error: 'used',
    });
    expect(accounts.users.has('b@example.com')).toBe(false);
  });

  it('needs a password: there is no Google-only join any more', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    expect(
      await joinWithInvite(deps, { code, email: 'g@gmail.com', password: undefined as never }, T0),
    ).toEqual({ ok: false, error: 'weak_password' });
    expect(accounts.users.size).toBe(0);
  });

  it('without a mail server, takes the email as given and unlocks at once', async () => {
    makeDeps(fakeMailer(false));
    const { code } = await createInviteLink(store, {}, T0);
    expect(
      await joinWithInvite(deps, { code, email: 'a@example.com', password: PW }, T0),
    ).toMatchObject({ ok: true, active: true });
    expect(accounts.users.get('a@example.com')!.locked).toBe(false);
    expect(mailer.sent).toHaveLength(0);
  });

  it('refuses an expired or revoked link', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    const later = at(INVITE_LINK_TTL_MS + 1);
    expect(await getInviteStatus(store, code, later)).toMatchObject({ state: 'expired' });
    expect(await joinWithInvite(deps, { code, email: 'a@b.co', password: PW }, later)).toEqual({
      ok: false,
      error: 'expired',
    });

    const other = await createInviteLink(store, {}, T0);
    expect(await decideInvite(deps, other.invite.id, 'revoke', T0)).toEqual({ ok: true });
    expect(
      await joinWithInvite(deps, { code: other.code, email: 'a@b.co', password: PW }, T0),
    ).toEqual({ ok: false, error: 'revoked' });
  });

  it('gives the link back when the account already exists', async () => {
    await accounts.createLocked({ email: 'taken@example.com', password: PW });
    const { code } = await createInviteLink(store, {}, T0);
    expect(
      await joinWithInvite(deps, { code, email: 'taken@example.com', password: PW }, T0),
    ).toEqual({ ok: false, error: 'account_exists' });
    expect(store.rows[0]).toMatchObject({ status: 'approved', used_at: null, email: null });
  });

  it('cancelling a joined but unverified link removes its locked account', async () => {
    const { code, invite } = await createInviteLink(store, {}, T0);
    await joinWithInvite(deps, { code, email: 'a@example.com', password: PW }, T0);
    expect(await decideInvite(deps, invite.id, 'revoke', T0)).toEqual({ ok: true });
    expect(accounts.users.has('a@example.com')).toBe(false);
    expect(await verifyEmail(deps, tokenIn(mailer, 'a@example.com'), T0)).toEqual({
      ok: false,
      error: 'revoked',
    });
  });

  it('rejects malformed codes, bad emails and short passwords', async () => {
    const { code } = await createInviteLink(store, {}, T0);
    expect(await getInviteStatus(store, 'nope', T0)).toEqual({ ok: false, error: 'invalid_code' });
    expect(await getInviteStatus(store, 'x'.repeat(32), T0)).toEqual({
      ok: false,
      error: 'invalid_code',
    });
    expect(await joinWithInvite(deps, { code, email: 'not-an-email', password: PW }, T0)).toEqual({
      ok: false,
      error: 'invalid_email',
    });
    expect(await joinWithInvite(deps, { code, email: 'a@b.co', password: 'short' }, T0)).toEqual({
      ok: false,
      error: 'weak_password',
    });
    expect(store.rows[0]!.status).toBe('approved');
  });
});

describe('access requests', () => {
  const ask = (email: string, ip = 'ip-1', when = T0, website = '') =>
    requestAccess(deps, { email, password: PW, note: 'hi, it is Rafi', ipHash: ip, website }, when);

  it('creates a locked account with the password, and emails a verification link', async () => {
    const res = await ask('Rafi@Example.com');
    if (!res.ok) throw new Error(res.error);
    expect(res.verificationSent).toBe(true);
    expect(accounts.users.get('rafi@example.com')).toMatchObject({ password: PW, locked: true });
    expect(await getInviteStatus(store, res.code, T0)).toMatchObject({
      kind: 'request',
      state: 'pending',
      email: 'rafi@example.com',
      account: { verified: false, approved: false, active: false },
    });
    expect(tokenIn(mailer, 'rafi@example.com')).toMatch(/^[A-Za-z0-9_-]{32}$/);
    // Neither code is stored, only their hashes.
    expect(JSON.stringify(store.rows)).not.toContain(res.code);
    expect(JSON.stringify(store.rows)).not.toContain(tokenIn(mailer, 'rafi@example.com'));
  });

  it('unlocks when verified and approved, in either order, and says so by email', async () => {
    const first = await ask('verify-first@example.com');
    const second = await ask('approve-first@example.com');
    if (!first.ok || !second.ok) throw new Error('request failed');
    const [a, b] = store.rows;

    expect(await verifyEmail(deps, tokenIn(mailer, 'verify-first@example.com'), T0)).toMatchObject({
      ok: true,
      approved: false,
      active: false,
    });
    expect(accounts.users.get('verify-first@example.com')!.locked).toBe(true);
    expect(await decideInvite(deps, a!.id, 'approve', at(HOUR))).toEqual({ ok: true });
    expect(accounts.users.get('verify-first@example.com')!.locked).toBe(false);

    expect(await decideInvite(deps, b!.id, 'approve', at(HOUR))).toEqual({ ok: true });
    expect(accounts.users.get('approve-first@example.com')!.locked).toBe(true);
    expect(await getInviteStatus(store, second.code, at(HOUR))).toMatchObject({
      state: 'used',
      account: { verified: false, approved: true, active: false },
    });
    expect(
      await verifyEmail(deps, tokenIn(mailer, 'approve-first@example.com'), at(2 * HOUR)),
    ).toMatchObject({ ok: true, approved: true, active: true });
    expect(accounts.users.get('approve-first@example.com')!.locked).toBe(false);

    for (const email of ['verify-first@example.com', 'approve-first@example.com']) {
      expect(subjectsTo(mailer, email)).toEqual([
        'Confirm your email for Kalponik',
        'Your Kalponik account is ready',
      ]);
    }
  });

  it('a declined request removes its locked account', async () => {
    const res = await ask('rafi@example.com');
    if (!res.ok) throw new Error(res.error);
    const id = store.rows[0]!.id;
    expect(await decideInvite(deps, id, 'decline', T0)).toEqual({ ok: true });
    expect(accounts.users.has('rafi@example.com')).toBe(false);
    expect(await getInviteStatus(store, res.code, T0)).toMatchObject({
      state: 'declined',
      account: null,
    });
    expect(await decideInvite(deps, id, 'approve', T0)).toEqual({ ok: false, error: 'bad_state' });
    expect(await decideInvite(deps, 'missing', 'approve', T0)).toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('refuses an email that already has an account or a request', async () => {
    expect((await ask('rafi@example.com')).ok).toBe(true);
    expect(await ask('rafi@example.com', 'ip-2')).toEqual({ ok: false, error: 'account_exists' });
  });

  it('a verification link expires, and can be sent again (not too often)', async () => {
    const res = await ask('rafi@example.com');
    if (!res.ok) throw new Error(res.error);
    const old = tokenIn(mailer, 'rafi@example.com');
    expect(await resendVerification(deps, res.code, at(1000))).toEqual({
      ok: false,
      error: 'too_soon',
    });
    expect(await verifyEmail(deps, old, at(VERIFY_TTL_MS + 1))).toEqual({
      ok: false,
      error: 'expired',
    });

    const later = at(VERIFY_TTL_MS + VERIFY_RESEND_MS);
    expect(await resendVerification(deps, res.code, later)).toEqual({ ok: true });
    const fresh = tokenIn(mailer, 'rafi@example.com');
    expect(fresh).not.toBe(old);
    expect(await verifyEmail(deps, old, later)).toEqual({ ok: false, error: 'invalid_code' });
    expect(await verifyEmail(deps, fresh, later)).toMatchObject({ ok: true });
    expect(await resendVerification(deps, res.code, later)).toEqual({
      ok: false,
      error: 'already_verified',
    });
  });

  it('emails the admins who asked for it, and nobody else', async () => {
    expect((await ask('quiet@example.com')).ok).toBe(true);
    expect(mailer.sent.map((m) => m.to)).toEqual(['quiet@example.com']);

    watchers = ['admin@example.com'];
    expect((await ask('loud@example.com', 'ip-2')).ok).toBe(true);
    const notice = mailer.sent.find((m) => m.to === 'admin@example.com');
    expect(notice?.subject).toBe('Kalponik: access request from loud@example.com');
    expect(notice?.text).toContain('hi, it is Rafi');
    expect(notice?.text).toContain('https://example.org/kalponik/admin');
  });

  it('without a mail server, waits only for the approval', async () => {
    makeDeps(fakeMailer(false));
    const res = await ask('rafi@example.com');
    if (!res.ok) throw new Error(res.error);
    expect(res.verificationSent).toBe(false);
    expect(await getInviteStatus(store, res.code, T0)).toMatchObject({
      account: { verified: true, approved: false, active: false },
    });
    expect(await resendVerification(deps, res.code, at(HOUR))).toEqual({
      ok: false,
      error: 'already_verified',
    });
    await decideInvite(deps, store.rows[0]!.id, 'approve', T0);
    expect(accounts.users.get('rafi@example.com')!.locked).toBe(false);
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
    expect(accounts.users.has('late@example.com')).toBe(false);
  });

  it('pretends to accept a bot that fills the hidden field, and keeps nothing', async () => {
    const res = await ask('bot@example.com', 'ip-9', T0, 'https://spam.example');
    expect(res.ok).toBe(true);
    expect(store.rows).toHaveLength(0);
    expect(accounts.users.size).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it('rejects an invalid email, a short password and an overlong note', async () => {
    expect(await ask('nope')).toEqual({ ok: false, error: 'invalid_email' });
    expect(
      await requestAccess(deps, { email: 'a@b.co', password: 'short', ipHash: 'ip' }, T0),
    ).toEqual({ ok: false, error: 'weak_password' });
    expect(
      await requestAccess(
        deps,
        { email: 'a@b.co', password: PW, note: 'x'.repeat(501), ipHash: 'ip' },
        T0,
      ),
    ).toEqual({ ok: false, error: 'note_too_long' });
    expect(accounts.users.size).toBe(0);
  });
});

describe('a request approved before accounts came first', () => {
  // Made before migration 036: approved, but no account yet. Its holder
  // creates the account on the join page, like an invite link for one email.
  const legacy = async () => {
    const res = await createInviteLink(store, {}, T0);
    Object.assign(store.rows[0]!, { kind: 'request', email: 'old@example.com' });
    return res.code;
  };

  it('joins with its own email and a password, then verifies', async () => {
    const code = await legacy();
    expect(
      await joinWithInvite(deps, { code, email: 'someone@else.com', password: PW }, T0),
    ).toEqual({ ok: false, error: 'email_mismatch' });
    expect(
      await joinWithInvite(deps, { code, email: 'OLD@example.com', password: PW }, T0),
    ).toMatchObject({ ok: true, active: false });
    await verifyEmail(deps, tokenIn(mailer, 'old@example.com'), T0);
    expect(accounts.users.get('old@example.com')!.locked).toBe(false);
  });

  it('a pending one without an account is approved the old way', async () => {
    const res = await createInviteLink(store, {}, T0);
    Object.assign(store.rows[0]!, { kind: 'request', status: 'pending', email: 'old@example.com' });
    expect(await decideInvite(deps, res.invite.id, 'approve', T0)).toEqual({ ok: true });
    expect(await getInviteStatus(store, res.code, T0)).toMatchObject({
      state: 'approved',
      expiresAt: at(APPROVED_REQUEST_TTL_MS).toISOString(),
      account: null,
    });
  });
});

describe('admin', () => {
  it('lists requests, accounts waiting on their email, open invites; never hashes', async () => {
    await requestAccess(deps, { email: 'r@example.com', password: PW, ipHash: 'ip' }, T0);
    const joined = await createInviteLink(store, { note: 'joined, not verified' }, T0);
    await joinWithInvite(deps, { code: joined.code, email: 'j@example.com', password: PW }, T0);
    await createInviteLink(store, { note: 'cousin' }, T0);
    const old = await createInviteLink(store, {}, T0);
    await decideInvite(deps, old.invite.id, 'revoke', T0);

    const list = await listInvitesForAdmin(store, at(HOUR));
    expect(list.pending.map((r) => [r.email, r.verified])).toEqual([['r@example.com', false]]);
    expect(list.waiting.map((r) => r.email)).toEqual(['j@example.com']);
    expect(list.active.map((r) => r.note)).toEqual(['cousin']);
    expect(list.recent.map((r) => r.state)).toEqual(['revoked']);
    expect(JSON.stringify(list)).not.toContain('token_hash');
    expect(JSON.stringify(list)).not.toContain('verify_hash');
  });
});

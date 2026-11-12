import { createHash, randomBytes } from 'node:crypto';

// Kalponik invite-only sign-up (server side).
//
// Supabase sign-up is off, so nobody can create an account by talking to
// Supabase directly. The API server creates accounts with the service role,
// and only against an `invites` row (migration 034) that allows it:
//
//   link     made by the admin and shared; approved from the start, any email.
//   request  left by a visitor on the site; pending until the admin approves
//            it; the account can only be created for the email they gave.
//
// Either way the visitor holds a random code (in the link, or behind their
// status page). The database keeps only its SHA-256, and a code creates one
// account at most.

export const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const APPROVED_REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const REQUEST_RATE_LIMIT = 3; // per IP per hour
export const REQUEST_RATE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_PENDING_REQUESTS = 30;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_NOTE_LENGTH = 500;

const CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export type InviteKind = 'link' | 'request';
export type InviteStatus = 'pending' | 'approved' | 'declined' | 'revoked' | 'used';
export type InviteState = InviteStatus | 'expired';

export interface InviteRow {
  id: string;
  token_hash: string;
  kind: InviteKind;
  status: InviteStatus;
  email: string | null;
  note: string | null;
  ip_hash: string | null;
  created_at: string;
  expires_at: string | null;
  decided_at: string | null;
  used_at: string | null;
  used_by: string | null;
}

export type NewInviteRow = Omit<InviteRow, 'id' | 'created_at'>;

export interface InviteStore {
  insert(row: NewInviteRow): Promise<InviteRow>;
  findByTokenHash(hash: string): Promise<InviteRow | null>;
  findById(id: string): Promise<InviteRow | null>;
  /** Applies `patch` only while the row still has status `expected`; null if it didn't. */
  updateIfStatus(
    id: string,
    expected: InviteStatus,
    patch: Partial<NewInviteRow>,
  ): Promise<InviteRow | null>;
  countRecentFromIp(ipHash: string, since: Date): Promise<number>;
  countPendingRequests(): Promise<number>;
  /** Newest first; enough rows to fill the admin page. */
  listRecent(): Promise<InviteRow[]>;
}

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'account_exists' | 'weak_password' | 'create_failed' };

export interface AccountCreator {
  createUser(input: { email: string; password?: string }): Promise<CreateUserResult>;
}

export type InviteError =
  | 'invalid_code'
  | 'not_found'
  | 'expired'
  | 'not_approved'
  | 'declined'
  | 'revoked'
  | 'used'
  | 'bad_state'
  | 'invalid_email'
  | 'email_mismatch'
  | 'weak_password'
  | 'note_too_long'
  | 'account_exists'
  | 'rate_limited'
  | 'too_many_pending'
  | 'create_failed';

export type Failure = { ok: false; error: InviteError };

export const hashInviteCode = (code: string) => createHash('sha256').update(code).digest('hex');

export const hashIp = (ip: string) =>
  createHash('sha256').update(`kalponik-ip:${ip}`).digest('hex');

const newCode = () => randomBytes(24).toString('base64url');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const cleanNote = (note: string | null | undefined) => {
  const trimmed = (note ?? '').trim();
  return trimmed ? trimmed : null;
};

const stateOf = (row: InviteRow, now: Date): InviteState => {
  if (row.status === 'approved' && row.expires_at && new Date(row.expires_at) <= now) {
    return 'expired';
  }
  return row.status;
};

const findByCode = async (store: InviteStore, code: string) => {
  if (typeof code !== 'string' || !CODE_PATTERN.test(code)) return null;
  return store.findByTokenHash(hashInviteCode(code));
};

export async function createInviteLink(
  store: InviteStore,
  { note }: { note?: string | null },
  now: Date,
) {
  const code = newCode();
  const invite = await store.insert({
    token_hash: hashInviteCode(code),
    kind: 'link',
    status: 'approved',
    email: null,
    note: cleanNote(note)?.slice(0, MAX_NOTE_LENGTH) ?? null,
    ip_hash: null,
    expires_at: new Date(now.getTime() + INVITE_LINK_TTL_MS).toISOString(),
    decided_at: now.toISOString(),
    used_at: null,
    used_by: null,
  });
  return { code, invite };
}

export async function requestAccess(
  store: InviteStore,
  input: { email: string; note?: string | null; ipHash: string; website?: string },
  now: Date,
): Promise<{ ok: true; code: string } | Failure> {
  const email = normalizeEmail(input.email ?? '');
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' };
  const note = cleanNote(input.note);
  if (note && note.length > MAX_NOTE_LENGTH) return { ok: false, error: 'note_too_long' };

  // The form's hidden "website" field is only ever filled by bots. Answer as
  // if it worked, so they learn nothing, and keep nothing.
  if (input.website) return { ok: true, code: newCode() };

  const since = new Date(now.getTime() - REQUEST_RATE_WINDOW_MS);
  if ((await store.countRecentFromIp(input.ipHash, since)) >= REQUEST_RATE_LIMIT) {
    return { ok: false, error: 'rate_limited' };
  }
  if ((await store.countPendingRequests()) >= MAX_PENDING_REQUESTS) {
    return { ok: false, error: 'too_many_pending' };
  }

  const code = newCode();
  await store.insert({
    token_hash: hashInviteCode(code),
    kind: 'request',
    status: 'pending',
    email,
    note,
    ip_hash: input.ipHash,
    expires_at: null,
    decided_at: null,
    used_at: null,
    used_by: null,
  });
  return { ok: true, code };
}

export async function getInviteStatus(
  store: InviteStore,
  code: string,
  now: Date,
): Promise<
  | {
      ok: true;
      kind: InviteKind;
      state: InviteState;
      email: string | null;
      expiresAt: string | null;
    }
  | Failure
> {
  const row = await findByCode(store, code);
  if (!row) return { ok: false, error: 'invalid_code' };
  return {
    ok: true,
    kind: row.kind,
    state: stateOf(row, now),
    // A request's email is the requester's own; a link's is nobody's yet.
    email: row.kind === 'request' ? row.email : null,
    expiresAt: row.expires_at,
  };
}

export async function decideInvite(
  store: InviteStore,
  id: string,
  action: 'approve' | 'decline' | 'revoke',
  now: Date,
): Promise<{ ok: true } | Failure> {
  const row = await store.findById(id);
  if (!row) return { ok: false, error: 'not_found' };
  const decidedAt = now.toISOString();
  let updated: InviteRow | null = null;
  if (action === 'approve' && row.kind === 'request') {
    updated = await store.updateIfStatus(id, 'pending', {
      status: 'approved',
      decided_at: decidedAt,
      expires_at: new Date(now.getTime() + APPROVED_REQUEST_TTL_MS).toISOString(),
    });
  } else if (action === 'decline' && row.kind === 'request') {
    updated = await store.updateIfStatus(id, 'pending', {
      status: 'declined',
      decided_at: decidedAt,
    });
  } else if (action === 'revoke') {
    updated =
      (await store.updateIfStatus(id, 'approved', { status: 'revoked', decided_at: decidedAt })) ??
      (await store.updateIfStatus(id, 'pending', { status: 'revoked', decided_at: decidedAt }));
  }
  return updated ? { ok: true } : { ok: false, error: 'bad_state' };
}

export async function joinWithInvite(
  store: InviteStore,
  accounts: AccountCreator,
  input: { code: string; email: string; password?: string },
  now: Date,
): Promise<{ ok: true; email: string; userId: string } | Failure> {
  const row = await findByCode(store, input.code);
  if (!row) return { ok: false, error: 'invalid_code' };
  const state = stateOf(row, now);
  if (state === 'pending') return { ok: false, error: 'not_approved' };
  if (state !== 'approved') return { ok: false, error: state };

  const email = normalizeEmail(input.email ?? '');
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' };
  if (row.kind === 'request' && row.email !== email) return { ok: false, error: 'email_mismatch' };
  if (input.password !== undefined && input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: 'weak_password' };
  }

  // Claim the code before creating the account, so two tabs racing on one
  // link can't both get one. Hand it back if the account isn't created.
  const claimed = await store.updateIfStatus(row.id, 'approved', {
    status: 'used',
    used_at: now.toISOString(),
    email,
  });
  if (!claimed) return { ok: false, error: 'used' };

  const created = await accounts.createUser({ email, password: input.password });
  if (!created.ok) {
    await store.updateIfStatus(row.id, 'used', {
      status: 'approved',
      used_at: null,
      email: row.email,
    });
    return { ok: false, error: created.error };
  }
  await store.updateIfStatus(row.id, 'used', { used_by: created.userId });
  return { ok: true, email, userId: created.userId };
}

export interface AdminInvite {
  id: string;
  kind: InviteKind;
  state: InviteState;
  email: string | null;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  usedAt: string | null;
}

const toAdmin = (row: InviteRow, now: Date): AdminInvite => ({
  id: row.id,
  kind: row.kind,
  state: stateOf(row, now),
  email: row.email,
  note: row.note,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  decidedAt: row.decided_at,
  usedAt: row.used_at,
});

export async function listInvitesForAdmin(store: InviteStore, now: Date) {
  const rows = (await store.listRecent()).map((row) => toAdmin(row, now));
  return {
    pending: rows.filter((r) => r.state === 'pending' && r.kind === 'request'),
    active: rows.filter((r) => r.state === 'approved'),
    recent: rows.filter((r) => !['pending', 'approved'].includes(r.state)).slice(0, 20),
  };
}

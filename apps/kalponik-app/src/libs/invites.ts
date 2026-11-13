import { createHash, randomBytes } from 'node:crypto';
import {
  accessRequestMail,
  accountReadyMail,
  verifyEmailMail,
  type InviteLinks,
  type MailMessage,
} from './inviteMail';

// Kalponik invite-only sign-up (server side).
//
// Supabase sign-up is off, so nobody can create an account by talking to
// Supabase directly. The API server creates accounts with the service role,
// and only against an `invites` row (migrations 034, 036) that allows it:
//
//   link     made by an admin and shared; approved from the start, any email.
//   request  left by a visitor on the site; pending until an admin approves it.
//
// The account is created up front, with the password the visitor chose: when
// they ask for access, or when they open an invite link and join. It starts
// locked (banned in Supabase Auth) and unlocks once both hold:
//
//   * their email is verified (a link we email them), and
//   * the invite is approved (a request by an admin; a link from the start).
//
// Then they get an email saying so, and sign in like anyone else. Without a
// mail server configured, emails can't be verified, so the address is taken
// as given and only the approval is waited for.
//
// The visitor holds a random code (in the link, or behind their status page),
// and the verification email carries another. The database keeps only their
// SHA-256 hashes.

export const INVITE_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const APPROVED_REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000;
export const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const VERIFY_RESEND_MS = 60 * 1000;
export const REQUEST_RATE_LIMIT = 3; // per IP per hour
export const REQUEST_RATE_WINDOW_MS = 60 * 60 * 1000;
export const MAX_PENDING_REQUESTS = 30;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72; // bcrypt's limit, which Supabase Auth uses
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
  /** The (locked, then unlocked) account, from the moment it exists. */
  used_by: string | null;
  verify_hash: string | null;
  verify_sent_at: string | null;
  email_verified_at: string | null;
  activated_at: string | null;
}

export type NewInviteRow = Omit<InviteRow, 'id' | 'created_at'>;

export interface InviteStore {
  insert(row: NewInviteRow): Promise<InviteRow>;
  findByTokenHash(hash: string): Promise<InviteRow | null>;
  findByVerifyHash(hash: string): Promise<InviteRow | null>;
  findById(id: string): Promise<InviteRow | null>;
  /** Applies `patch` only while the row still has status `expected`; null if it didn't. */
  updateIfStatus(
    id: string,
    expected: InviteStatus,
    patch: Partial<NewInviteRow>,
  ): Promise<InviteRow | null>;
  update(id: string, patch: Partial<NewInviteRow>): Promise<InviteRow | null>;
  /** Sets `activated_at` only if it is still empty; false if someone else got there first. */
  claimActivation(id: string, at: string): Promise<boolean>;
  countRecentFromIp(ipHash: string, since: Date): Promise<number>;
  countPendingRequests(): Promise<number>;
  /** Newest first; enough rows to fill the admin page. */
  listRecent(): Promise<InviteRow[]>;
}

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'account_exists' | 'weak_password' | 'create_failed' };

/** Supabase Auth accounts, through the admin API. */
export interface AccountService {
  /** A new account that can't sign in yet (banned, email not confirmed). */
  createLocked(input: { email: string; password: string }): Promise<CreateUserResult>;
  /** Lifts the lock and marks the email confirmed. */
  activate(userId: string): Promise<boolean>;
  remove(userId: string): Promise<void>;
}

export interface Mailer {
  /** False when no mail server is configured: nothing can be sent. */
  readonly enabled: boolean;
  send(message: MailMessage): Promise<boolean>;
}

export interface InviteDeps {
  store: InviteStore;
  accounts: AccountService;
  mailer: Mailer;
  links: InviteLinks;
  /** Emails of the admins who asked to hear about new requests. */
  requestWatchers?: () => Promise<string[]>;
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
  | 'create_failed'
  | 'already_verified'
  | 'mail_off'
  | 'too_soon';

export type Failure = { ok: false; error: InviteError };

export const hashInviteCode = (code: string) => createHash('sha256').update(code).digest('hex');

export const hashIp = (ip: string) =>
  createHash('sha256').update(`kalponik-ip:${ip}`).digest('hex');

const newCode = () => randomBytes(24).toString('base64url');

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export const isValidEmail = (email: string) =>
  email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidPassword = (password: unknown): password is string =>
  typeof password === 'string' &&
  password.length >= MIN_PASSWORD_LENGTH &&
  password.length <= MAX_PASSWORD_LENGTH;

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

/** A fresh verification code for `row`'s email, or nothing when mail is off. */
const verificationFields = (mailer: Mailer, now: Date) => {
  if (!mailer.enabled) {
    return {
      code: null,
      fields: { verify_hash: null, verify_sent_at: null, email_verified_at: now.toISOString() },
    };
  }
  const code = newCode();
  return {
    code,
    fields: {
      verify_hash: hashInviteCode(code),
      verify_sent_at: now.toISOString(),
      email_verified_at: null,
    },
  };
};

const sendQuietly = async (mailer: Mailer, message: MailMessage) => {
  if (!mailer.enabled) return false;
  try {
    return await mailer.send(message);
  } catch (error) {
    console.error('invites: sending mail failed', error);
    return false;
  }
};

/**
 * Unlocks the account once its email is verified and its invite approved.
 * Returns whether the account is unlocked now. Safe to call any number of
 * times: only one call unlocks and sends the "you're in" email.
 */
async function activateIfReady(deps: InviteDeps, row: InviteRow, now: Date) {
  if (row.activated_at) return true;
  if (row.status !== 'used' || !row.used_by || !row.email_verified_at) return false;
  if (!(await deps.store.claimActivation(row.id, now.toISOString()))) return true;
  if (!(await deps.accounts.activate(row.used_by))) {
    await deps.store.update(row.id, { activated_at: null });
    return false;
  }
  if (row.email) await sendQuietly(deps.mailer, accountReadyMail(deps.links, row.email));
  return true;
}

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
    verify_hash: null,
    verify_sent_at: null,
    email_verified_at: null,
    activated_at: null,
  });
  return { code, invite };
}

export async function requestAccess(
  deps: InviteDeps,
  input: {
    email: string;
    password: string;
    note?: string | null;
    ipHash: string;
    website?: string;
  },
  now: Date,
): Promise<{ ok: true; code: string; verificationSent: boolean } | Failure> {
  const { store, accounts, mailer } = deps;
  const email = normalizeEmail(input.email ?? '');
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' };
  if (!isValidPassword(input.password)) return { ok: false, error: 'weak_password' };
  const note = cleanNote(input.note);
  if (note && note.length > MAX_NOTE_LENGTH) return { ok: false, error: 'note_too_long' };

  // The form's hidden "website" field is only ever filled by bots. Answer as
  // if it worked, so they learn nothing, and keep nothing.
  if (input.website) return { ok: true, code: newCode(), verificationSent: mailer.enabled };

  const since = new Date(now.getTime() - REQUEST_RATE_WINDOW_MS);
  if ((await store.countRecentFromIp(input.ipHash, since)) >= REQUEST_RATE_LIMIT) {
    return { ok: false, error: 'rate_limited' };
  }
  if ((await store.countPendingRequests()) >= MAX_PENDING_REQUESTS) {
    return { ok: false, error: 'too_many_pending' };
  }

  const created = await accounts.createLocked({ email, password: input.password });
  if (!created.ok) return created;

  const code = newCode();
  const verify = verificationFields(mailer, now);
  try {
    await store.insert({
      token_hash: hashInviteCode(code),
      kind: 'request',
      status: 'pending',
      email,
      note,
      ip_hash: input.ipHash,
      expires_at: null,
      decided_at: null,
      used_at: now.toISOString(),
      used_by: created.userId,
      ...verify.fields,
      activated_at: null,
    });
  } catch (error) {
    await accounts.remove(created.userId);
    throw error;
  }

  const verificationSent = verify.code
    ? await sendQuietly(mailer, verifyEmailMail(deps.links, email, verify.code))
    : false;

  const watchers = (await deps.requestWatchers?.().catch(() => [])) ?? [];
  for (const to of watchers) {
    await sendQuietly(mailer, accessRequestMail(deps.links, to, { email, note }));
  }

  return { ok: true, code, verificationSent };
}

export interface InviteAccountState {
  verified: boolean;
  approved: boolean;
  active: boolean;
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
      /** The account this invite created, while it exists. */
      account: InviteAccountState | null;
    }
  | Failure
> {
  const row = await findByCode(store, code);
  if (!row) return { ok: false, error: 'invalid_code' };
  const state = stateOf(row, now);
  return {
    ok: true,
    kind: row.kind,
    state,
    // Whoever holds the code gave this email (a request, or a joined link).
    email: row.email,
    expiresAt: row.expires_at,
    account:
      row.used_by && (state === 'pending' || state === 'used')
        ? {
            verified: !!row.email_verified_at,
            approved: state === 'used',
            active: !!row.activated_at,
          }
        : null,
  };
}

export async function decideInvite(
  deps: InviteDeps,
  id: string,
  action: 'approve' | 'decline' | 'revoke',
  now: Date,
): Promise<{ ok: true } | Failure> {
  const { store, accounts } = deps;
  const row = await store.findById(id);
  if (!row) return { ok: false, error: 'not_found' };
  const decidedAt = now.toISOString();
  let updated: InviteRow | null = null;

  if (action === 'approve' && row.kind === 'request') {
    // A request made before migration 036 has no account yet: it is approved
    // the old way, and its holder creates the account on the join page.
    updated = await store.updateIfStatus(
      id,
      'pending',
      row.used_by
        ? { status: 'used', decided_at: decidedAt }
        : {
            status: 'approved',
            decided_at: decidedAt,
            expires_at: new Date(now.getTime() + APPROVED_REQUEST_TTL_MS).toISOString(),
          },
    );
    if (updated) await activateIfReady(deps, updated, now);
  } else if (action === 'decline' && row.kind === 'request') {
    updated = await store.updateIfStatus(id, 'pending', {
      status: 'declined',
      decided_at: decidedAt,
    });
  } else if (action === 'revoke') {
    updated =
      (await store.updateIfStatus(id, 'approved', { status: 'revoked', decided_at: decidedAt })) ??
      (await store.updateIfStatus(id, 'pending', { status: 'revoked', decided_at: decidedAt })) ??
      // Joined, but the email was never verified: the account is still locked.
      (!row.activated_at
        ? await store.updateIfStatus(id, 'used', { status: 'revoked', decided_at: decidedAt })
        : null);
  }
  if (!updated) return { ok: false, error: 'bad_state' };

  // A refused account was never usable: remove it, so the email is free again.
  if (updated.status === 'declined' || updated.status === 'revoked') {
    if (updated.used_by && !updated.activated_at) await accounts.remove(updated.used_by);
  }
  return { ok: true };
}

export async function joinWithInvite(
  deps: InviteDeps,
  input: { code: string; email: string; password: string },
  now: Date,
): Promise<{ ok: true; email: string; userId: string; active: boolean } | Failure> {
  const { store, accounts, mailer } = deps;
  const row = await findByCode(store, input.code);
  if (!row) return { ok: false, error: 'invalid_code' };
  const state = stateOf(row, now);
  if (state === 'pending') return { ok: false, error: 'not_approved' };
  if (state !== 'approved') return { ok: false, error: state };

  const email = normalizeEmail(input.email ?? '');
  if (!isValidEmail(email)) return { ok: false, error: 'invalid_email' };
  if (row.kind === 'request' && row.email !== email) return { ok: false, error: 'email_mismatch' };
  if (!isValidPassword(input.password)) return { ok: false, error: 'weak_password' };

  // Claim the code before creating the account, so two tabs racing on one
  // link can't both get one. Hand it back if the account isn't created.
  const claimed = await store.updateIfStatus(row.id, 'approved', {
    status: 'used',
    used_at: now.toISOString(),
    email,
  });
  if (!claimed) return { ok: false, error: 'used' };

  const created = await accounts.createLocked({ email, password: input.password });
  if (!created.ok) {
    await store.updateIfStatus(row.id, 'used', {
      status: 'approved',
      used_at: null,
      email: row.email,
    });
    return { ok: false, error: created.error };
  }

  const verify = verificationFields(mailer, now);
  const withAccount =
    (await store.update(row.id, { used_by: created.userId, ...verify.fields })) ?? claimed;
  if (verify.code) await sendQuietly(mailer, verifyEmailMail(deps.links, email, verify.code));
  const active = await activateIfReady(deps, withAccount, now);
  return { ok: true, email, userId: created.userId, active };
}

/** The link in the verification email. */
export async function verifyEmail(
  deps: InviteDeps,
  token: string,
  now: Date,
): Promise<{ ok: true; email: string | null; approved: boolean; active: boolean } | Failure> {
  if (typeof token !== 'string' || !CODE_PATTERN.test(token)) {
    return { ok: false, error: 'invalid_code' };
  }
  let row = await deps.store.findByVerifyHash(hashInviteCode(token));
  if (!row) return { ok: false, error: 'invalid_code' };
  if (row.status === 'declined' || row.status === 'revoked') {
    return { ok: false, error: row.status };
  }
  if (!row.used_by) return { ok: false, error: 'invalid_code' };
  if (!row.email_verified_at) {
    const sentAt = row.verify_sent_at ? new Date(row.verify_sent_at).getTime() : 0;
    if (now.getTime() - sentAt > VERIFY_TTL_MS) return { ok: false, error: 'expired' };
    row = (await deps.store.update(row.id, { email_verified_at: now.toISOString() })) ?? row;
  }
  const active = await activateIfReady(deps, row, now);
  return { ok: true, email: row.email, approved: row.status === 'used', active };
}

/** "Send the email again", from the status page. */
export async function resendVerification(
  deps: InviteDeps,
  code: string,
  now: Date,
): Promise<{ ok: true } | Failure> {
  const row = await findByCode(deps.store, code);
  if (!row) return { ok: false, error: 'invalid_code' };
  if (!row.used_by || !row.email || !['pending', 'used'].includes(row.status)) {
    return { ok: false, error: 'bad_state' };
  }
  if (row.email_verified_at) return { ok: false, error: 'already_verified' };
  if (!deps.mailer.enabled) return { ok: false, error: 'mail_off' };
  if (
    row.verify_sent_at &&
    now.getTime() - new Date(row.verify_sent_at).getTime() < VERIFY_RESEND_MS
  ) {
    return { ok: false, error: 'too_soon' };
  }
  const verify = verificationFields(deps.mailer, now);
  await deps.store.update(row.id, verify.fields);
  await sendQuietly(deps.mailer, verifyEmailMail(deps.links, row.email, verify.code!));
  return { ok: true };
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
  hasAccount: boolean;
  verified: boolean;
  active: boolean;
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
  hasAccount: !!row.used_by,
  verified: !!row.email_verified_at,
  active: !!row.activated_at,
});

export async function listInvitesForAdmin(store: InviteStore, now: Date) {
  const rows = (await store.listRecent()).map((row) => toAdmin(row, now));
  const isWaiting = (r: AdminInvite) => r.state === 'used' && r.hasAccount && !r.active;
  return {
    /** Requests for an admin to approve or decline. */
    pending: rows.filter((r) => r.state === 'pending' && r.kind === 'request'),
    /** Approved, with an account that waits for its email to be verified. */
    waiting: rows.filter(isWaiting),
    /** Invites that can still be used to join. */
    active: rows.filter((r) => r.state === 'approved'),
    recent: rows
      .filter((r) => !['pending', 'approved'].includes(r.state) && !isWaiting(r))
      .slice(0, 20),
  };
}

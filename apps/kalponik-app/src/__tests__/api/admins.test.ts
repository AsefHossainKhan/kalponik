// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import {
  addAdmin,
  isAdmin,
  isRootAdmin,
  listAdmins,
  removeAdmin,
  type AdminRow,
  type AdminStore,
  type UserDirectory,
} from '@/libs/admins';

// Who may open the admin page: the root admin(s) named in the server setting
// KALPONIK_ADMINS (emails or user ids), plus admins added from the app.
// Root admins can't be removed from the app, so they can't be locked out.

const T0 = new Date('2026-11-12T10:00:00Z');
const ROOT = { id: 'u-root', email: 'root@gmail.com' };
const FRIEND = { id: 'u-friend', email: 'friend@example.com' };
const OTHER = { id: 'u-other', email: 'other@example.com' };
const ENV = ' Root@Gmail.com ';

const directory = (): UserDirectory => {
  const users = [ROOT, FRIEND, OTHER];
  return {
    async findByEmail(email) {
      return users.find((u) => u.email === email) ?? null;
    },
    async getById(id) {
      return users.find((u) => u.id === id) ?? null;
    },
  };
};

const memoryStore = (): AdminStore & { rows: AdminRow[] } => {
  const rows: AdminRow[] = [];
  return {
    rows,
    async list() {
      return rows.map((r) => ({ ...r }));
    },
    async has(userId) {
      return rows.some((r) => r.user_id === userId);
    },
    async add(userId, addedBy, now) {
      rows.push({ user_id: userId, added_by: addedBy, created_at: now.toISOString() });
    },
    async remove(userId) {
      const i = rows.findIndex((r) => r.user_id === userId);
      if (i < 0) return false;
      rows.splice(i, 1);
      return true;
    },
  };
};

let store: ReturnType<typeof memoryStore>;
const users = directory();

beforeEach(() => {
  store = memoryStore();
});

describe('root admins', () => {
  it('match by email (any case) or by user id', () => {
    expect(isRootAdmin(ROOT, ENV)).toBe(true);
    expect(isRootAdmin({ id: 'u-root', email: null }, 'u-root, someone@x.com')).toBe(true);
    expect(isRootAdmin(FRIEND, ENV)).toBe(false);
    expect(isRootAdmin({ id: '', email: '' }, ',,')).toBe(false);
    expect(isRootAdmin(ROOT, undefined)).toBe(false);
  });
});

describe('admins added from the app', () => {
  it('a root admin adds an admin by email, who then counts as an admin', async () => {
    expect(await isAdmin(store, FRIEND, ENV)).toBe(false);
    expect(await addAdmin(store, users, ROOT, ' Friend@Example.com ', T0)).toEqual({
      ok: true,
    });
    expect(await isAdmin(store, FRIEND, ENV)).toBe(true);
    expect(store.rows).toEqual([
      { user_id: 'u-friend', added_by: 'u-root', created_at: T0.toISOString() },
    ]);
  });

  it('only existing accounts can be added, and only once', async () => {
    expect(await addAdmin(store, users, ROOT, 'nobody@example.com', T0)).toEqual({
      ok: false,
      error: 'no_account',
    });
    expect(await addAdmin(store, users, ROOT, 'not an email', T0)).toEqual({
      ok: false,
      error: 'invalid_email',
    });
    await addAdmin(store, users, ROOT, FRIEND.email, T0);
    expect(await addAdmin(store, users, ROOT, FRIEND.email, T0)).toEqual({
      ok: false,
      error: 'already_admin',
    });
    expect(await addAdmin(store, users, FRIEND, ROOT.email, T0, ENV)).toEqual({
      ok: false,
      error: 'already_admin',
    });
  });

  it('an added admin can add and remove others, but nobody removes a root admin or themselves', async () => {
    await addAdmin(store, users, ROOT, FRIEND.email, T0);
    expect(await addAdmin(store, users, FRIEND, OTHER.email, T0, ENV)).toEqual({ ok: true });
    expect(await removeAdmin(store, users, FRIEND, OTHER.id, ENV)).toEqual({ ok: true });
    expect(await isAdmin(store, OTHER, ENV)).toBe(false);

    expect(await removeAdmin(store, users, FRIEND, ROOT.id, ENV)).toEqual({
      ok: false,
      error: 'root_admin',
    });
    expect(await removeAdmin(store, users, FRIEND, FRIEND.id, ENV)).toEqual({
      ok: false,
      error: 'self',
    });
    expect(await removeAdmin(store, users, ROOT, 'u-missing', ENV)).toEqual({
      ok: false,
      error: 'not_admin',
    });
    expect(await removeAdmin(store, users, ROOT, FRIEND.id, ENV)).toEqual({ ok: true });
    expect(await isAdmin(store, FRIEND, ENV)).toBe(false);
  });

  it('lists root admins first, then added admins, with their emails', async () => {
    await addAdmin(store, users, ROOT, FRIEND.email, T0);
    expect(await listAdmins(store, users, ENV)).toEqual([
      { id: 'u-root', email: 'root@gmail.com', root: true, addedAt: null },
      { id: 'u-friend', email: 'friend@example.com', root: false, addedAt: T0.toISOString() },
    ]);
  });

  it('lists a root admin whose account does not exist yet by the configured email', async () => {
    expect(await listAdmins(store, users, 'future@gmail.com')).toEqual([
      { id: null, email: 'future@gmail.com', root: true, addedAt: null },
    ]);
  });
});

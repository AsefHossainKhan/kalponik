import { describe, expect, it, vi } from 'vitest';
import { applyAdminCheck, checkAdminStatus, readCachedAdminStatus } from '@/libs/adminStatus';

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

const respond = (status: number, body: unknown = {}) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('checkAdminStatus', () => {
  it('is an admin when the admin list loads, with the waiting count', async () => {
    const check = await checkAdminStatus('https://x/api', 't', respond(200, { pending: [{}, {}] }));
    expect(check).toEqual({ kind: 'admin', pending: 2 });
  });

  it('is not an admin when the server refuses', async () => {
    expect(await checkAdminStatus('https://x/api', 't', respond(403))).toEqual({
      kind: 'not_admin',
    });
  });

  it('does not decide when offline, signed out or on a server error', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await checkAdminStatus('https://x/api', 't', offline)).toEqual({ kind: 'unknown' });
    expect(await checkAdminStatus('https://x/api', 't', respond(401))).toEqual({ kind: 'unknown' });
    expect(await checkAdminStatus('https://x/api', 't', respond(500))).toEqual({ kind: 'unknown' });
  });
});

describe('admin status on the device', () => {
  it('remembers the answer per account, so the entry shows offline', () => {
    const storage = memoryStorage();
    applyAdminCheck(storage, 'u1', null, { kind: 'admin', pending: 3 });
    expect(readCachedAdminStatus(storage, 'u1')).toEqual({ isAdmin: true, pending: 3 });
    expect(readCachedAdminStatus(storage, 'u2')).toBeNull();
  });

  it('keeps what it knew when the check is inconclusive', () => {
    const storage = memoryStorage();
    const known = applyAdminCheck(storage, 'u1', null, { kind: 'admin', pending: 1 });
    expect(applyAdminCheck(storage, 'u1', known, { kind: 'unknown' })).toEqual(known);
    expect(readCachedAdminStatus(storage, 'u1')).toEqual({ isAdmin: true, pending: 1 });
  });

  it('drops the entry once the server says the account is no longer an admin', () => {
    const storage = memoryStorage();
    const known = applyAdminCheck(storage, 'u1', null, { kind: 'admin', pending: 0 });
    expect(applyAdminCheck(storage, 'u1', known, { kind: 'not_admin' })).toEqual({
      isAdmin: false,
      pending: 0,
    });
    expect(readCachedAdminStatus(storage, 'u1')?.isAdmin).toBe(false);
  });

  it('ignores a damaged saved value', () => {
    const storage = memoryStorage();
    storage.setItem('kalponik-admin:u1', '{not json');
    expect(readCachedAdminStatus(storage, 'u1')).toBeNull();
  });
});

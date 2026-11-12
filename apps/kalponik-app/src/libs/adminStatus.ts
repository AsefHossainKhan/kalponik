// Kalponik: whether the signed-in account is an admin, for showing the Admin
// entry in the library menu and on the account page. The server decides
// (GET /api/admin/invites answers 403 to non-admins); the answer is kept on
// the device per account so the entry still shows offline.

export interface AdminStatus {
  isAdmin: boolean;
  /** Access requests waiting for a decision. */
  pending: number;
}

export type AdminCheck =
  | { kind: 'admin'; pending: number }
  | { kind: 'not_admin' }
  /** Offline, signed out or a server error: keep what we knew. */
  | { kind: 'unknown' };

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const storageKey = (userId: string) => `kalponik-admin:${userId}`;

export const readCachedAdminStatus = (
  storage: StorageLike | null | undefined,
  userId: string,
): AdminStatus | null => {
  try {
    const raw = storage?.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdminStatus>;
    if (typeof parsed.isAdmin !== 'boolean') return null;
    return {
      isAdmin: parsed.isAdmin,
      pending: typeof parsed.pending === 'number' && parsed.pending > 0 ? parsed.pending : 0,
    };
  } catch {
    return null;
  }
};

/** Apply a server answer to what we knew; stores and returns the new status. */
export const applyAdminCheck = (
  storage: StorageLike | null | undefined,
  userId: string,
  previous: AdminStatus | null,
  check: AdminCheck,
): AdminStatus | null => {
  if (check.kind === 'unknown') return previous;
  const next: AdminStatus =
    check.kind === 'admin'
      ? { isAdmin: true, pending: check.pending }
      : { isAdmin: false, pending: 0 };
  try {
    storage?.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Storage full or blocked: the status still applies for this session.
  }
  return next;
};

export const checkAdminStatus = async (
  apiBaseUrl: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AdminCheck> => {
  try {
    const response = await fetchImpl(`${apiBaseUrl}/admin/invites`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 403) return { kind: 'not_admin' };
    if (!response.ok) return { kind: 'unknown' };
    const body = (await response.json()) as { pending?: unknown };
    return { kind: 'admin', pending: Array.isArray(body.pending) ? body.pending.length : 0 };
  } catch {
    return { kind: 'unknown' };
  }
};

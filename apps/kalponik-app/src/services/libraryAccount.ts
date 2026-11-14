import { DATA_SUBDIR, LOCAL_BOOKS_SUBDIR, SETTINGS_FILENAME } from './constants';

// Kalponik: each account gets its own library on a device.
//
// The books folder (library.json, every book's file, cover and reading
// position) used to be one folder per device, so everyone who signed in on a
// phone saw the same shelf. Now the folder belongs to an account:
//
//   - The first account bound on a device keeps the old folder,
//     `Kalponik/Books`. On almost every device that is the only person who
//     ever signed in, so nothing moves and nothing is copied.
//   - Every other account gets `Kalponik/Accounts/<user-id>/Books`.
//
// The binding lives in localStorage (synchronous, so the hot path resolver
// can read it) and survives signing out: the folder only changes when a
// different account signs in. Settings follow the same rule: the first
// account keeps `settings.json`, every other account gets
// `settings-<user-id>.json`. Fonts and dictionaries stay shared.

export const LIBRARY_ACCOUNT_KEY = 'kalponik.libraryAccount';
export const LEGACY_LIBRARY_OWNER_KEY = 'kalponik.legacyLibraryOwner';

// Supabase user ids are UUIDs; anything else never reaches a path.
const ACCOUNT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isValidAccountId = (id: unknown): id is string =>
  typeof id === 'string' && ACCOUNT_ID_RE.test(id);

let boundAccount: string | null | undefined;
const listeners = new Set<(account: string) => void>();
let legacyOwner: string | null | undefined;

const readKey = (key: string): string | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeKey = (key: string, value: string) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the binding still holds for this run.
  }
};

const readStoredUserId = (): string | null => {
  const json = readKey('user');
  if (!json) return null;
  try {
    const id = (JSON.parse(json) as { id?: unknown })?.id;
    return isValidAccountId(id) ? id : null;
  } catch {
    return null;
  }
};

/** The account whose library this device shows, or null before any sign-in. */
export const getLibraryAccount = (): string | null => {
  if (boundAccount === undefined) {
    const stored = readKey(LIBRARY_ACCOUNT_KEY);
    // A session saved before this feature has a user but no binding yet.
    boundAccount = isValidAccountId(stored) ? stored : readStoredUserId();
  }
  return boundAccount;
};

const getLegacyOwner = (): string | null => {
  if (legacyOwner === undefined) {
    const stored = readKey(LEGACY_LIBRARY_OWNER_KEY);
    legacyOwner = isValidAccountId(stored) ? stored : null;
  }
  return legacyOwner;
};

/**
 * Makes `accountId` the device's library account. Returns true when that
 * changes which library is shown, so the caller drops the one in memory.
 */
export const bindLibraryAccount = (accountId: string | null | undefined): boolean => {
  if (!isValidAccountId(accountId)) return false;
  const previousDir = getLocalBooksSubdir();
  const previous = getLibraryAccount();
  if (!getLegacyOwner()) {
    legacyOwner = accountId;
    writeKey(LEGACY_LIBRARY_OWNER_KEY, accountId);
  }
  boundAccount = accountId;
  writeKey(LIBRARY_ACCOUNT_KEY, accountId);
  if (previous && previous !== accountId) {
    for (const listener of [...listeners]) {
      try {
        listener(accountId);
      } catch (err) {
        console.warn('account change listener failed', err);
      }
    }
  }
  return getLocalBooksSubdir() !== previousDir;
};

/** Called with the new account id whenever a different account is bound. */
export const onLibraryAccountChange = (listener: (account: string) => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The settings file, relative to the Settings base, for the bound account. */
export const getAccountSettingsFilename = (): string => {
  const account = getLibraryAccount();
  if (!account) return SETTINGS_FILENAME;
  const owner = getLegacyOwner();
  if (!owner || owner === account) return SETTINGS_FILENAME;
  return `settings-${account}.json`;
};

/** The books folder, relative to the app's data root, for the bound account. */
export const getLocalBooksSubdir = (): string => {
  const account = getLibraryAccount();
  if (!account) return LOCAL_BOOKS_SUBDIR;
  const owner = getLegacyOwner();
  if (!owner || owner === account) return LOCAL_BOOKS_SUBDIR;
  return `${DATA_SUBDIR}/Accounts/${account}/Books`;
};

/** Test hook: forget the cached binding so the next read goes to storage. */
export const resetLibraryAccountCache = () => {
  listeners.clear();
  boundAccount = undefined;
  legacyOwner = undefined;
};

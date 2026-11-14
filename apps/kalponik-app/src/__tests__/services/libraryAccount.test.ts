import { describe, test, expect, beforeEach } from 'vitest';
import {
  LEGACY_LIBRARY_OWNER_KEY,
  LIBRARY_ACCOUNT_KEY,
  bindLibraryAccount,
  getLibraryAccount,
  getLocalBooksSubdir,
  resetLibraryAccountCache,
} from '@/services/libraryAccount';
import { resetSyncCursorsForAccount } from '@/services/settingsService';
import type { SystemSettings } from '@/types/settings';

const ALICE = '11111111-2222-4333-8444-555555555555';
const BOB = '99999999-8888-4777-8666-555555555555';

describe('per-account books folder', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLibraryAccountCache();
  });

  test('before any sign-in the device uses the old shared folder', () => {
    expect(getLibraryAccount()).toBeNull();
    expect(getLocalBooksSubdir()).toBe('Kalponik/Books');
  });

  test('the first account keeps the old folder, so nothing moves on update', () => {
    expect(bindLibraryAccount(ALICE)).toBe(false);
    expect(getLocalBooksSubdir()).toBe('Kalponik/Books');
    expect(localStorage.getItem(LEGACY_LIBRARY_OWNER_KEY)).toBe(ALICE);
  });

  test('another account gets its own folder, and switching back restores the first', () => {
    bindLibraryAccount(ALICE);
    expect(bindLibraryAccount(BOB)).toBe(true);
    expect(getLocalBooksSubdir()).toBe(`Kalponik/Accounts/${BOB}/Books`);
    expect(bindLibraryAccount(BOB)).toBe(false);
    expect(bindLibraryAccount(ALICE)).toBe(true);
    expect(getLocalBooksSubdir()).toBe('Kalponik/Books');
  });

  test('the binding survives a restart', () => {
    bindLibraryAccount(ALICE);
    bindLibraryAccount(BOB);
    resetLibraryAccountCache();
    expect(getLibraryAccount()).toBe(BOB);
    expect(getLocalBooksSubdir()).toBe(`Kalponik/Accounts/${BOB}/Books`);
  });

  test('a session saved before this feature binds to its stored user', () => {
    localStorage.setItem('user', JSON.stringify({ id: ALICE }));
    expect(getLibraryAccount()).toBe(ALICE);
    expect(localStorage.getItem(LIBRARY_ACCOUNT_KEY)).toBeNull();
  });

  test('ids that are not user ids never reach a path', () => {
    expect(bindLibraryAccount('../../etc')).toBe(false);
    localStorage.setItem(LIBRARY_ACCOUNT_KEY, '../x');
    resetLibraryAccountCache();
    expect(getLibraryAccount()).toBeNull();
    expect(getLocalBooksSubdir()).toBe('Kalponik/Books');
  });
});

describe('sync cursors follow the account', () => {
  const cursors = (account?: string) =>
    ({
      lastSyncedAtBooks: 100,
      lastSyncedAtConfigs: 200,
      lastSyncedAtNotes: 300,
      syncCursorsAccount: account,
    }) as SystemSettings;

  test('cursors saved before the setting existed are adopted by the first account', () => {
    const settings = cursors();
    expect(resetSyncCursorsForAccount(settings, ALICE)).toBe(false);
    expect(settings.lastSyncedAtBooks).toBe(100);
    expect(settings.syncCursorsAccount).toBe(ALICE);
  });

  test('a different account starts its pull from zero', () => {
    const settings = cursors(ALICE);
    expect(resetSyncCursorsForAccount(settings, BOB)).toBe(true);
    expect(settings.lastSyncedAtBooks).toBe(0);
    expect(settings.lastSyncedAtConfigs).toBe(0);
    expect(settings.lastSyncedAtNotes).toBe(0);
    expect(settings.syncCursorsAccount).toBe(BOB);
  });

  test('the same account, or no account, keeps the cursors', () => {
    const settings = cursors(ALICE);
    expect(resetSyncCursorsForAccount(settings, ALICE)).toBe(false);
    expect(resetSyncCursorsForAccount(settings, null)).toBe(false);
    expect(settings.lastSyncedAtNotes).toBe(300);
  });
});

// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { SETTINGS_FILENAME } from '@/services/constants';
import {
  bindLibraryAccount,
  getAccountSettingsFilename,
  onLibraryAccountChange,
  resetLibraryAccountCache,
} from '@/services/libraryAccount';
import { loadSettings, saveSettings } from '@/services/settingsService';
import type { SystemSettings } from '@/types/settings';
import type { FileSystem } from '@/types/system';

const ALICE = '11111111-2222-4333-8444-555555555555';
const BOB = '99999999-8888-4777-8666-555555555555';

const makeFs = () => {
  const files = new Map<string, string>();
  const fs = {
    readFile: async (path: string) => {
      const value = files.get(path);
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    writeFile: async (path: string, _base: unknown, content: string) => {
      files.set(path, content);
    },
    exists: async (path: string) => files.has(path),
    getPrefix: async () => 'Books',
  } as unknown as FileSystem;
  return { fs, files };
};

const ctx = (fs: FileSystem) => ({ fs, isMobile: false, isEink: false, isAppDataSandbox: false });

describe('each account keeps its own settings file on a device', () => {
  beforeEach(() => {
    localStorage.clear();
    resetLibraryAccountCache();
  });

  test('the first account keeps the old settings.json', () => {
    bindLibraryAccount(ALICE);
    expect(getAccountSettingsFilename()).toBe(SETTINGS_FILENAME);
  });

  test('another account gets its own file, and switching back restores the first', () => {
    bindLibraryAccount(ALICE);
    bindLibraryAccount(BOB);
    expect(getAccountSettingsFilename()).toBe(`settings-${BOB}.json`);
    bindLibraryAccount(ALICE);
    expect(getAccountSettingsFilename()).toBe(SETTINGS_FILENAME);
  });

  test("a second account does not see the first account's settings", async () => {
    const { fs } = makeFs();
    bindLibraryAccount(ALICE);
    const alice = await loadSettings(ctx(fs));
    alice.globalViewSettings.uiLanguage = 'bn';
    alice.globalViewSettings.defaultFontSize = 30;
    await saveSettings(fs, alice);

    bindLibraryAccount(BOB);
    const bob = await loadSettings(ctx(fs));
    expect(bob.globalViewSettings.uiLanguage).not.toBe('bn');
    expect(bob.globalViewSettings.defaultFontSize).not.toBe(30);

    bindLibraryAccount(ALICE);
    const aliceAgain = await loadSettings(ctx(fs));
    expect(aliceAgain.globalViewSettings.uiLanguage).toBe('bn');
  });

  test("settings loaded for one account are never written into another's file", async () => {
    const { fs, files } = makeFs();
    bindLibraryAccount(ALICE);
    const alice = await loadSettings(ctx(fs));
    alice.globalViewSettings.defaultFontSize = 30;

    bindLibraryAccount(BOB);
    // A late save of the store's old copy, after the switch.
    await saveSettings(fs, alice);
    expect(files.has(`settings-${BOB}.json`)).toBe(false);
  });

  test('listeners hear about a switch, not about binding the same account again', () => {
    const heard: string[] = [];
    const stop = onLibraryAccountChange((account) => heard.push(account));
    bindLibraryAccount(ALICE);
    bindLibraryAccount(BOB);
    bindLibraryAccount(BOB);
    bindLibraryAccount(ALICE);
    stop();
    bindLibraryAccount(BOB);
    expect(heard).toEqual([BOB, ALICE]);
  });
});

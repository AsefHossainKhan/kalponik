import { describe, it, expect, vi, beforeEach } from 'vitest';

const fs = vi.hoisted(() => ({
  readDir: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppCache: 16 },
  readDir: fs.readDir,
  remove: fs.remove,
}));

import { removeUpdateApks } from '@/helpers/updateApkCleanup';

const file = (name: string) => ({ name, isFile: true, isDirectory: false, isSymlink: false });
const dir = (name: string) => ({ name, isFile: false, isDirectory: true, isSymlink: false });

beforeEach(() => {
  fs.readDir.mockReset();
  fs.remove.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('removeUpdateApks', () => {
  it('removes every update APK in the cache and nothing else', async () => {
    fs.readDir.mockResolvedValue([
      file('Kalponik_0.12.25_arm64.apk'),
      file('Kalponik_0.12.26_arm64.apk'),
      file('Kalponik_0.11.4-2026061406_arm64.apk'),
      file('book-cover.png'),
      file('other.apk'),
      dir('tts'),
    ]);

    const removed = await removeUpdateApks();

    expect(removed).toEqual([
      'Kalponik_0.12.25_arm64.apk',
      'Kalponik_0.12.26_arm64.apk',
      'Kalponik_0.11.4-2026061406_arm64.apk',
    ]);
    expect(fs.remove).toHaveBeenCalledTimes(3);
    expect(fs.remove).toHaveBeenCalledWith('Kalponik_0.12.25_arm64.apk', { baseDir: 16 });
  });

  it('keeps the APK it is told to keep', async () => {
    fs.readDir.mockResolvedValue([
      file('Kalponik_0.12.27_arm64.apk'),
      file('Kalponik_0.12.28_arm64.apk'),
    ]);

    const removed = await removeUpdateApks({ keep: 'Kalponik_0.12.28_arm64.apk' });

    expect(removed).toEqual(['Kalponik_0.12.27_arm64.apk']);
  });

  it('at startup removes the installed version and older, not a newer pending one', async () => {
    fs.readDir.mockResolvedValue([
      file('Kalponik_0.12.27_arm64.apk'),
      file('Kalponik_0.12.28_arm64.apk'),
      file('Kalponik_0.12.29_arm64.apk'),
    ]);

    const removed = await removeUpdateApks({ installedVersion: '0.12.28' });

    expect(removed).toEqual(['Kalponik_0.12.27_arm64.apk', 'Kalponik_0.12.28_arm64.apk']);
  });

  it('never throws when the cache cannot be read or a file cannot be removed', async () => {
    fs.readDir.mockRejectedValueOnce(new Error('denied'));
    await expect(removeUpdateApks()).resolves.toEqual([]);

    fs.readDir.mockResolvedValue([
      file('Kalponik_0.12.25_arm64.apk'),
      file('Kalponik_0.12.26_arm64.apk'),
    ]);
    fs.remove.mockRejectedValueOnce(new Error('busy'));
    await expect(removeUpdateApks()).resolves.toEqual(['Kalponik_0.12.26_arm64.apk']);
  });
});

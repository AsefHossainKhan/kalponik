import semver from 'semver';
import { BaseDirectory, readDir, remove } from '@tauri-apps/plugin-fs';

// The Android updater downloads `Kalponik_<version>_<abi>.apk` into the app
// cache and hands it to the system installer. Nothing removed it afterwards,
// so every update left one APK behind in the cache.
const UPDATE_APK = /^Kalponik_(.+)_[^_]+\.apk$/;

const apkVersion = (name: string): string | null => {
  const match = UPDATE_APK.exec(name);
  if (!match) return null;
  return semver.valid(match[1]!) ? match[1]! : null;
};

/**
 * Delete update APKs from the app cache.
 *
 * - `keep`: a file name to leave alone (the APK about to be downloaded).
 * - `installedVersion`: only delete APKs for this version or older. Used at
 *   startup, so an APK for a newer version that the installer may still be
 *   reading is left until the next download replaces it.
 *
 * Best effort: a failure is logged and never thrown.
 */
export const removeUpdateApks = async (
  opts: { keep?: string; installedVersion?: string } = {},
): Promise<string[]> => {
  const removed: string[] = [];
  try {
    const entries = await readDir('', { baseDir: BaseDirectory.AppCache });
    for (const entry of entries) {
      if (!entry.isFile || entry.name === opts.keep) continue;
      const version = apkVersion(entry.name);
      if (!version) continue;
      if (opts.installedVersion && semver.gt(version, opts.installedVersion)) continue;
      try {
        await remove(entry.name, { baseDir: BaseDirectory.AppCache });
        removed.push(entry.name);
      } catch (error) {
        console.warn('Failed to remove old update APK', entry.name, error);
      }
    }
  } catch (error) {
    console.warn('Failed to clean up old update APKs', error);
  }
  return removed;
};

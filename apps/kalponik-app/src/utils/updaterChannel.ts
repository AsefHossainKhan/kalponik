import { KALPONIK_NIGHTLY_UPDATER_FILE } from '@/services/constants';

const DESKTOP_OS_TYPES = ['macos', 'windows', 'linux'];

// True when a nightly update feed exists. Kalponik publishes none, so the
// Nightly Builds switch is hidden and update checks always use stable.
export const isNightlyChannelAvailable = (
  nightlyFile: string = KALPONIK_NIGHTLY_UPDATER_FILE,
): boolean => Boolean(nightlyFile);

// Reads the build flag NEXT_PUBLIC_DISABLE_UPDATER:
// - unset or empty: the updater is on everywhere it is supported;
// - 'desktop': off on macOS, Windows and Linux only (Kalponik's .env.tauri,
//   since Kalponik releases only an Android APK);
// - any other value: off everywhere.
export const isUpdaterDisabledByEnv = (
  osType: string,
  flag: string | undefined = process.env['NEXT_PUBLIC_DISABLE_UPDATER'],
): boolean => {
  if (!flag) return false;
  if (flag.trim().toLowerCase() === 'desktop') return DESKTOP_OS_TYPES.includes(osType);
  return true;
};

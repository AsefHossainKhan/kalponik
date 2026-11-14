import { isTauriAppPlatform } from '@/services/environment';
import { getOSPlatform } from '@/utils/misc';
import type { ReadingPlatform } from './model';

/** Which platform's reading sets this device reads and writes. */
export const getReadingPlatform = (): ReadingPlatform => {
  if (!isTauriAppPlatform()) return 'web';
  const os = getOSPlatform();
  if (os === 'android') return 'android';
  if (os === 'ios') return 'ios';
  return 'desktop';
};

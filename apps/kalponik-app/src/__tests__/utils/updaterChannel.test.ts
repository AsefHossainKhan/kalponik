import { describe, expect, it } from 'vitest';
import { isNightlyChannelAvailable, isUpdaterDisabledByEnv } from '@/utils/updaterChannel';

describe('isUpdaterDisabledByEnv', () => {
  it('keeps the updater on when the flag is unset or empty', () => {
    for (const os of ['android', 'windows', 'macos', 'linux']) {
      expect(isUpdaterDisabledByEnv(os, undefined)).toBe(false);
      expect(isUpdaterDisabledByEnv(os, '')).toBe(false);
    }
  });

  it("'desktop' turns it off on desktop but keeps it on for Android", () => {
    expect(isUpdaterDisabledByEnv('android', 'desktop')).toBe(false);
    expect(isUpdaterDisabledByEnv('windows', 'desktop')).toBe(true);
    expect(isUpdaterDisabledByEnv('macos', 'desktop')).toBe(true);
    expect(isUpdaterDisabledByEnv('linux', 'desktop')).toBe(true);
    expect(isUpdaterDisabledByEnv('android', ' Desktop ')).toBe(false);
  });

  it('any other value turns it off everywhere (the web build sets true)', () => {
    expect(isUpdaterDisabledByEnv('android', 'true')).toBe(true);
    expect(isUpdaterDisabledByEnv('windows', '1')).toBe(true);
  });
});

describe('isNightlyChannelAvailable', () => {
  it('is false when there is no nightly feed', () => {
    expect(isNightlyChannelAvailable('')).toBe(false);
    expect(isNightlyChannelAvailable()).toBe(false);
  });

  it('is true when a nightly feed URL is set', () => {
    expect(isNightlyChannelAvailable('https://example.com/nightly/latest.json')).toBe(true);
  });
});

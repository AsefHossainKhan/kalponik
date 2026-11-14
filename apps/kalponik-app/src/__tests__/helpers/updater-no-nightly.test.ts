// @vitest-environment happy-dom
// Kalponik publishes no nightly feed (KALPONIK_NIGHTLY_UPDATER_FILE is empty):
// a saved 'nightly' channel must still find stable Android updates, and the
// manifest the release workflow writes must be one the updater accepts.
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { buildUpdateManifest } from '../../../scripts/kalponik-release-manifest.mjs';

const mockOsType = vi.fn();
const mockOsArch = vi.fn();
const mockTauriFetch = vi.fn();
const mockSetUpdaterWindowVisible = vi.fn();

vi.mock('@tauri-apps/plugin-updater', () => ({ check: vi.fn() }));
vi.mock('@tauri-apps/plugin-os', () => ({ type: () => mockOsType(), arch: () => mockOsArch() }));
vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: (...args: unknown[]) => mockTauriFetch(...args),
}));
vi.mock('@tauri-apps/api/webviewWindow', () => ({ WebviewWindow: class {} }));
vi.mock('@/components/UpdaterWindow', () => ({
  setUpdaterWindowVisible: (...args: unknown[]) => mockSetUpdaterWindowVisible(...args),
}));
vi.mock('@/services/environment', () => ({ isTauriAppPlatform: () => true }));
vi.mock('@/utils/version', async () => {
  const actual = await vi.importActual<typeof import('@/utils/version')>('@/utils/version');
  return { ...actual, getAppVersion: () => '0.12.24' };
});
vi.mock('@/services/constants', () => ({
  CHECK_UPDATE_INTERVAL_SEC: 86400,
  KALPONIK_UPDATER_FILE: 'https://example.com/latest.json',
  KALPONIK_CHANGELOG_FILE: 'https://example.com/release-notes.json',
  KALPONIK_NIGHTLY_UPDATER_FILE: '',
}));

import { checkForAppUpdates } from '@/helpers/updater';

const manifest = buildUpdateManifest({
  version: '0.12.25',
  apkUrl: 'https://example.com/Kalponik_0.12.25_arm64.apk',
  pubDate: '2026-11-14T09:00:00Z',
  notes: 'In-app updates',
});
const translate = (s: string) => s;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockOsType.mockReturnValue('android');
  mockOsArch.mockReturnValue('aarch64');
  mockTauriFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve(manifest) });
});

describe('checkForAppUpdates without a nightly feed', () => {
  test("offers the release workflow's manifest to an arm64 phone", async () => {
    const result = await checkForAppUpdates(translate, false, 'stable');
    expect(result).toBe(true);
    expect(mockTauriFetch).toHaveBeenCalledWith('https://example.com/latest.json', {
      connectTimeout: 5000,
    });
    expect(mockSetUpdaterWindowVisible).toHaveBeenCalledWith(true, '0.12.25', '0.12.24');
  });

  test("a saved 'nightly' channel falls back to stable", async () => {
    const result = await checkForAppUpdates(translate, false, 'nightly');
    expect(result).toBe(true);
    expect(mockTauriFetch).toHaveBeenCalledTimes(1);
    expect(mockTauriFetch.mock.calls[0]![0]).toBe('https://example.com/latest.json');
    expect(mockSetUpdaterWindowVisible).toHaveBeenCalledWith(true, '0.12.25', '0.12.24');
  });

  test('an armv7 phone gets no offer for the arm64-only manifest', async () => {
    mockOsArch.mockReturnValue('arm');
    await checkForAppUpdates(translate, false, 'stable');
    expect(mockSetUpdaterWindowVisible).not.toHaveBeenCalled();
  });
});

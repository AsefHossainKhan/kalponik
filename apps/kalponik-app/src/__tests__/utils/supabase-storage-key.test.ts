// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadStorageKey = async (url?: string) => {
  vi.resetModules();
  if (url) vi.stubEnv('SUPABASE_URL', url);
  vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
  const { supabase } = await import('@/utils/supabase');
  return (supabase.auth as unknown as { storageKey: string }).storageKey;
};

describe('supabase session storage key', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ships a placeholder default, never Readest's project URL", () => {
    expect(atob(process.env['NEXT_PUBLIC_DEFAULT_SUPABASE_URL_BASE64']!)).toBe(
      'https://example.supabase.co',
    );
  });

  // Kalponik: no special cases for Readest's cloud hosts. Every project,
  // ours included, keeps supabase-js's default key from the host's first
  // label, so existing sessions survive this change.
  it.each([
    ['https://abcdefghijklmnop.supabase.co', 'sb-abcdefghijklmnop-auth-token'],
    ['https://vbsyxfusjjqdxkjqlysc.supabase.co', 'sb-vbsyxfusjjqdxkjqlysc-auth-token'],
    ['https://auth.readest.com', 'sb-auth-auth-token'],
  ])('uses the host-derived key for %s', async (url, key) => {
    expect(await loadStorageKey(url)).toBe(key);
  });

  it('keeps the host-derived key for a local instance', async () => {
    expect(await loadStorageKey('http://localhost:54321')).toBe('sb-localhost-auth-token');
  });
});

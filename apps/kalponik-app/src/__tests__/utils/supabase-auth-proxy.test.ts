// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Readest's old cloud project: it used to route through Readest's auth proxy.
const READEST_CLOUD_URL = 'https://vbsyxfusjjqdxkjqlysc.supabase.co';
const PROJECT_URL = 'https://abcdefghijklmnop.supabase.co';

const fetchMock = vi.fn<typeof fetch>();

const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: 'bearer',
  user: { id: 'user', aud: 'authenticated', app_metadata: {}, user_metadata: {} },
};

const loadClient = async (url: string) => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  const { supabase } = await import('@/utils/supabase');
  return supabase;
};

const requestedUrls = () => fetchMock.mock.calls.map(([input]) => String(input));

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify(session), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// Kalponik never uses Readest's auth proxy (auth-cf.readest.com): every auth
// call, password sign-in and refresh included, goes to our own project.
describe('auth routing', () => {
  it.each([
    PROJECT_URL,
    READEST_CLOUD_URL,
  ])('sends password sign-in, refresh and sign-out to %s itself', async (url) => {
    const supabase = await loadClient(url);

    await supabase.auth.signInWithPassword({ email: 'a@b.c', password: 'pw' });
    await supabase.auth.refreshSession();
    fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
    await supabase.auth.signOut({ scope: 'local' });

    expect(requestedUrls()).toEqual([
      `${url}/auth/v1/token?grant_type=password`,
      `${url}/auth/v1/token?grant_type=refresh_token`,
      `${url}/auth/v1/logout?scope=local`,
    ]);
  });

  it('keeps OAuth on the Supabase host, where its callback lands', async () => {
    const supabase = await loadClient(PROJECT_URL);

    const { data } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { skipBrowserRedirect: true },
    });

    expect(data.url?.startsWith(`${PROJECT_URL}/auth/v1/authorize`)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

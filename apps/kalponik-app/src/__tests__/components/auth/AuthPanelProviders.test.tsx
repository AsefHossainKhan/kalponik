// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

/**
 * Kalponik's Supabase project only has Google and email/password sign-in set
 * up, so the panel must not offer Readest's Apple, GitHub or Discord buttons.
 */

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { getAppService: async () => ({}) },
    appService: null,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, opts?: Record<string, string>) =>
    opts ? key.replace(/\{\{(\w+)\}\}/g, (_m, name) => opts[name] ?? _m) : key,
}));

vi.mock('@/utils/settingsSync', () => ({
  broadcastGlobalSettings: vi.fn(),
}));

import AuthPanel from '@/app/auth/components/AuthPanel';
import { ENABLED_OAUTH_PROVIDERS } from '@/app/auth/components/oauthProviders';

afterEach(() => {
  cleanup();
});

describe('AuthPanel sign-in providers', () => {
  test('offers Google and hides Apple, GitHub and Discord', () => {
    render(<AuthPanel supabaseClient={{} as never} onProviderSignIn={vi.fn()} />);

    const providerButtons = screen
      .getAllByRole('button', { name: /^Sign in with / })
      .map((button) => button.textContent);
    expect(providerButtons).toEqual(['Sign in with Google']);
  });

  test('the enabled list is the single switch for provider buttons', () => {
    expect(ENABLED_OAUTH_PROVIDERS).toEqual(['google']);
  });
});

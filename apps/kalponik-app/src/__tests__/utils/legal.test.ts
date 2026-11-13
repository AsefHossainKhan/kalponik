import { describe, expect, it } from 'vitest';
import { privacyPolicyUrl } from '@/utils/legal';
import { requiresSignIn } from '@/utils/signInGate';

describe('privacyPolicyUrl', () => {
  it("links to Kalponik's own policy in the web app, not Readest's", () => {
    expect(privacyPolicyUrl(false, 'https://asroy.duckdns.org/kalponik')).toBe('/privacy');
  });

  it('opens the live web page from the Android/desktop app', () => {
    expect(privacyPolicyUrl(true, 'https://asroy.duckdns.org/kalponik/')).toBe(
      'https://asroy.duckdns.org/kalponik/privacy',
    );
  });

  it('is a page anyone can read without signing in', () => {
    expect(requiresSignIn('/privacy')).toBe(false);
  });
});

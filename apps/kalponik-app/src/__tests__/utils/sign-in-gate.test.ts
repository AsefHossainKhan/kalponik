import { describe, expect, it } from 'vitest';
import { requiresSignIn, signInUrlFor } from '@/utils/signInGate';

describe('requiresSignIn', () => {
  it('requires an account for the library, reader, account and admin pages', () => {
    for (const path of [
      '/',
      '/library',
      '/library/',
      '/reader',
      '/reader/abc123',
      '/player',
      '/opds',
      '/user',
      '/user/subscription/success',
      '/admin',
      '/send',
    ]) {
      expect(requiresSignIn(path), path).toBe(true);
    }
  });

  it('leaves the pages that get someone signed in open', () => {
    for (const path of [
      '/auth',
      '/auth/callback',
      '/auth/error',
      '/auth/recovery',
      '/join',
      '/request-access',
      '/offline',
      '/gdrive-callback',
      '/onedrive-callback',
      '/s',
      '/o',
      '/link',
      '/libraryx',
    ]) {
      expect(requiresSignIn(path), path).toBe(false);
    }
  });

  it('does not redirect before the path is known', () => {
    expect(requiresSignIn(null)).toBe(false);
  });
});

describe('signInUrlFor', () => {
  it('comes back to the page after signing in', () => {
    expect(signInUrlFor('/reader', '?ids=abc')).toBe('/auth?redirect=%2Freader%3Fids%3Dabc');
  });

  it('needs no redirect for the home page', () => {
    expect(signInUrlFor('/')).toBe('/auth');
  });
});

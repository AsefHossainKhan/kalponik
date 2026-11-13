import { describe, it, expect } from 'vitest';
import {
  isLockedAccountError,
  kalponikAuthErrorMessage,
} from '@/app/auth/utils/kalponikAuthErrors';

// A locked account (asked for access, not yet verified and approved) signs in
// to `user_banned`. The sign-in form and the error page must say what that
// means instead of showing "User is banned".

const _ = (s: string) => s;

describe('kalponikAuthErrorMessage', () => {
  it('explains a locked account instead of "banned"', () => {
    for (const code of ['user_banned', 'email_not_confirmed']) {
      expect(isLockedAccountError(code)).toBe(true);
      expect(kalponikAuthErrorMessage(_, code)).toMatch(/not ready yet/);
    }
  });

  it('explains the two Google-linking refusals', () => {
    expect(kalponikAuthErrorMessage(_, 'identity_already_exists')).toMatch(/already linked/);
    expect(kalponikAuthErrorMessage(_, 'manual_linking_disabled')).toMatch(/not turned on/);
  });

  it('leaves other errors to Supabase', () => {
    expect(isLockedAccountError('invalid_credentials')).toBe(false);
    expect(kalponikAuthErrorMessage(_, 'invalid_credentials')).toBeNull();
    expect(kalponikAuthErrorMessage(_, undefined)).toBeNull();
  });
});

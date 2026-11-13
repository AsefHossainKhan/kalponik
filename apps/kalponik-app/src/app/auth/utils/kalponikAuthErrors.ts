import type { TranslationFunc } from '@/hooks/useTranslation';

// Kalponik: sign-in errors that come from invite-only sign-up, in words.
//
// Accounts are created locked (banned in Supabase Auth) when someone asks for
// access or joins with an invite link, and unlock once the email is verified
// and the request approved. Until then Supabase answers `user_banned`, for a
// password sign-in and for Google alike, which on its own reads like a
// punishment.

/** Supabase error codes meaning "this account is not unlocked yet". */
export const LOCKED_ACCOUNT_CODES = ['user_banned', 'email_not_confirmed'];

export const isLockedAccountError = (code: string | null | undefined) =>
  !!code && LOCKED_ACCOUNT_CODES.includes(code);

/** A message for a sign-in error Kalponik explains itself, or null for the rest. */
export const kalponikAuthErrorMessage = (
  _: TranslationFunc,
  code: string | null | undefined,
): string | null => {
  if (isLockedAccountError(code)) {
    return _(
      'Your account is not ready yet. Verify your email with the link we sent you, and wait for your request to be approved. We will email you when it is ready.',
    );
  }
  switch (code) {
    case 'identity_already_exists':
      return _('That Google account is already linked to another Kalponik account.');
    case 'manual_linking_disabled':
      return _('Linking Google is not turned on for this server yet.');
    default:
      return null;
  }
};

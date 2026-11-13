import { getAPIBaseUrl, getBaseUrl, isWebAppPlatform } from '@/services/environment';
import { BASE_PATH } from '@/utils/basePath';
import type { TranslationFunc } from '@/hooks/useTranslation';

// Browser-side calls for invite-only sign-up (see src/libs/invites.ts).

export type InviteState = 'pending' | 'approved' | 'declined' | 'revoked' | 'used' | 'expired';

export interface InviteStatus {
  kind: 'link' | 'request';
  state: InviteState;
  email: string | null;
  expiresAt: string | null;
  /** The account this invite created, while it exists (locked until verified and approved). */
  account: { verified: boolean; approved: boolean; active: boolean } | null;
  /** Whether the server sends email (verification links, "you're in"). */
  mail: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 72;

export { KALPONIK_APK_URL } from '@/libs/inviteMail';

/** Where a requester's code is kept, so they can find their status page again. */
export const REQUEST_CODE_KEY = 'kalponik-access-request-code';

/**
 * The web app's own address. In the browser that is wherever this page was
 * served from; the Android app is a local bundle, so it uses the configured
 * server address instead.
 */
export const getWebAppUrl = () =>
  isWebAppPlatform() && typeof window !== 'undefined'
    ? `${window.location.origin}${BASE_PATH}`
    : getBaseUrl();

export const getJoinUrl = (code: string) =>
  `${getWebAppUrl()}/join?code=${encodeURIComponent(code)}`;

const call = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${getAPIBaseUrl()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, status: response.status, body };
};

export const fetchInviteStatus = (code: string) =>
  call<InviteStatus>(`/invites/status?code=${encodeURIComponent(code)}`, { cache: 'no-store' });

export const postAccessRequest = (input: {
  email: string;
  password: string;
  note: string;
  website: string;
}) =>
  call<{ code: string; verificationSent: boolean }>('/invites/request', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const postJoin = (input: { code: string; email: string; password: string }) =>
  call<{ email: string; active: boolean }>('/invites/join', {
    method: 'POST',
    body: JSON.stringify(input),
  });

export const postVerifyEmail = (token: string) =>
  call<{ email: string | null; approved: boolean; active: boolean }>('/invites/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });

export const postResendVerification = (code: string) =>
  call<{ ok: boolean }>('/invites/resend', { method: 'POST', body: JSON.stringify({ code }) });

export const readSavedRequestCode = () => {
  try {
    return localStorage.getItem(REQUEST_CODE_KEY);
  } catch {
    return null;
  }
};

export const saveRequestCode = (code: string) => {
  try {
    localStorage.setItem(REQUEST_CODE_KEY, code);
  } catch {
    // Private mode: the status link still works if they keep it.
  }
};

export const inviteErrorMessage = (_: TranslationFunc, error: string | undefined) => {
  switch (error) {
    case 'invalid_email':
      return _('Please enter a valid email address.');
    case 'email_mismatch':
      return _('Use the email address you asked for access with.');
    case 'weak_password':
      return _('Choose a password of 8 to 72 characters.');
    case 'note_too_long':
      return _('Please keep the note under 500 characters.');
    case 'account_exists':
      return _(
        'There is already an account or a request for this email. Sign in, or open the status page of your request.',
      );
    case 'already_verified':
      return _('Your email is already verified.');
    case 'mail_off':
      return _('This server does not send email.');
    case 'too_soon':
      return _('An email was sent a moment ago. Please wait a minute before asking again.');
    case 'rate_limited':
      return _('Too many requests from your network. Please try again in an hour.');
    case 'too_many_pending':
      return _('There are too many requests waiting right now. Please try again later.');
    case 'used':
      return _('This invite has already been used.');
    case 'expired':
      return _('This link has expired. Ask for a new one.');
    case 'revoked':
      return _('This invite was cancelled. Ask for a new one.');
    case 'declined':
      return _('This request was not approved.');
    case 'not_approved':
      return _('This request has not been approved yet.');
    case 'invalid_code':
      return _('This link is not valid. Check that you copied all of it.');
    default:
      return _('Something went wrong. Please try again.');
  }
};

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
}

/** The newest Android release. Stable name, attached by the release workflow. */
export const KALPONIK_APK_URL =
  process.env['NEXT_PUBLIC_KALPONIK_APK_URL'] ||
  'https://github.com/AsefHossainKhan/kalponik/releases/latest/download/Kalponik_arm64.apk';

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

export const postAccessRequest = (input: { email: string; note: string; website: string }) =>
  call<{ code: string }>('/invites/request', { method: 'POST', body: JSON.stringify(input) });

export const postJoin = (input: { code: string; email: string; password?: string }) =>
  call<{ email: string }>('/invites/join', { method: 'POST', body: JSON.stringify(input) });

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
      return _('Choose a password of at least 8 characters.');
    case 'note_too_long':
      return _('Please keep the note under 500 characters.');
    case 'account_exists':
      return _('There is already an account with this email. Sign in instead.');
    case 'rate_limited':
      return _('Too many requests from your network. Please try again in an hour.');
    case 'too_many_pending':
      return _('There are too many requests waiting right now. Please try again later.');
    case 'used':
      return _('This invite has already been used.');
    case 'expired':
      return _('This invite has expired. Ask for a new one.');
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

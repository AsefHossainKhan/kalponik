'use client';

import { useCallback, useEffect, useState } from 'react';
import type { UserIdentity } from '@supabase/supabase-js';
import { FcGoogle } from 'react-icons/fc';
import { useAuth } from '@/context/AuthContext';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { isTauriAppPlatform } from '@/services/environment';
import { supabase } from '@/utils/supabase';
import { withBasePath } from '@/utils/basePath';
import { parseOAuthCallbackUrl } from '@/helpers/auth';
import { authWithCustomTab, authWithSafari } from '@/app/auth/utils/nativeAuth';
import { kalponikAuthErrorMessage } from '@/app/auth/utils/kalponikAuthErrors';

// Kalponik: "Link Google" on the account page. Accounts are made with an
// email and password; a Gmail account signs in with Google on its own (same
// verified address), and this links Google to any other account, so either
// way of signing in reaches the same library. Needs "Allow manual linking"
// on in Supabase Auth (docs/DEPLOY.md).

const DEEPLINK_CALLBACK = 'kalponik://auth-callback';

export default function LinkGoogleEntry() {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { login } = useAuth();
  const [identities, setIdentities] = useState<UserIdentity[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadIdentities = useCallback(async () => {
    const { data, error } = await supabase.auth.getUserIdentities();
    if (!error) setIdentities(data.identities);
  }, []);

  useEffect(() => {
    loadIdentities();
  }, [loadIdentities]);

  // The web follows a redirect; the apps open a browser tab that returns the
  // callback URL. Desktop apps have no such tab, so they don't offer linking.
  const nativeTab = appService?.isAndroidApp || appService?.isIOSApp || appService?.isMacOSApp;
  if (!identities || (isTauriAppPlatform() && !nativeTab)) return null;

  const google = identities.find((i) => i.provider === 'google');
  const googleEmail = (google?.identity_data?.['email'] as string | undefined) ?? null;

  const linkOnApp = async () => {
    const { data, error } = await supabase.auth.linkIdentity({
      provider: 'google',
      options: { skipBrowserRedirect: true, redirectTo: DEEPLINK_CALLBACK },
    });
    if (error || !data.url) throw error ?? new Error('no url');
    const res = appService?.isAndroidApp
      ? await authWithCustomTab({ authUrl: data.url, callbackUrl: DEEPLINK_CALLBACK })
      : await authWithSafari({ authUrl: data.url });
    if (!res) return;
    const callback = parseOAuthCallbackUrl(res.redirectUrl);
    if (callback.error) {
      setError(
        kalponikAuthErrorMessage(_, callback.errorCode) ??
          callback.errorDescription ??
          _('Linking Google did not work.'),
      );
      return;
    }
    if (callback.accessToken && callback.refreshToken) {
      const { data: session } = await supabase.auth.setSession({
        access_token: callback.accessToken,
        refresh_token: callback.refreshToken,
      });
      if (session.session) login(session.session.access_token, session.session.user);
    }
    await loadIdentities();
  };

  const link = async () => {
    setBusy(true);
    setError('');
    try {
      if (isTauriAppPlatform()) {
        await linkOnApp();
      } else {
        const redirectTo = `${window.location.origin}${withBasePath('/auth/callback')}?next=/user`;
        const { error } = await supabase.auth.linkIdentity({
          provider: 'google',
          options: { redirectTo },
        });
        if (error) throw error;
        // The browser is on its way to Google.
      }
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      setError(kalponikAuthErrorMessage(_, code) ?? _('Linking Google did not work.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className='flex flex-col gap-2'>
      {google ? (
        <div className='eink-bordered border-base-300 flex h-12 w-full items-center gap-2 rounded-xl border px-4 text-sm'>
          <FcGoogle className='h-5 w-5 shrink-0' />
          <span className='truncate'>
            {googleEmail
              ? _('Google sign-in linked: {{email}}', { email: googleEmail })
              : _('Google sign-in linked')}
          </span>
        </div>
      ) : (
        <button
          className='btn btn-ghost eink-bordered border-base-300 h-12 min-h-12 w-full justify-start gap-2 rounded-xl'
          onClick={link}
          disabled={busy}
        >
          <FcGoogle className='h-5 w-5' />
          {busy ? _('Opening Google...') : _('Link Google sign-in')}
        </button>
      )}
      {error && (
        <div
          role='alert'
          className='eink-bordered border-error/30 bg-error/5 text-error rounded-lg border px-3 py-2.5 text-center text-sm leading-relaxed'
        >
          {error}
        </div>
      )}
    </div>
  );
}

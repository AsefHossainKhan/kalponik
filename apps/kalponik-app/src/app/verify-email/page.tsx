'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import InviteShell, {
  Notice,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/app/join/InviteShell';
import { inviteErrorMessage, postVerifyEmail, readSavedRequestCode } from '@/app/join/inviteClient';

// /verify-email?token=...  Where the link in the verification email lands.
// Confirms the address; if the invite is approved already, that unlocks the
// account and the server emails "your account is ready".

type Result =
  | { kind: 'loading' }
  | { kind: 'ok'; email: string | null; active: boolean }
  | { kind: 'error'; error: string };

export default function VerifyEmailPage() {
  const _ = useTranslation();
  const router = useRouter();
  const [result, setResult] = useState<Result>({ kind: 'loading' });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get('token') ?? '';
    postVerifyEmail(token)
      .then(({ ok, body }) =>
        setResult(
          ok
            ? { kind: 'ok', email: body.email, active: body.active }
            : { kind: 'error', error: body.error ?? 'invalid_code' },
        ),
      )
      .catch(() => setResult({ kind: 'error', error: 'network' }));
  }, []);

  if (result.kind === 'loading') {
    return (
      <InviteShell title={_('Verifying your email')}>
        <div className='flex justify-center py-6'>
          <span className='loading loading-spinner loading-md' aria-label={_('Loading')} />
        </div>
      </InviteShell>
    );
  }

  if (result.kind === 'error') {
    const savedCode = readSavedRequestCode();
    return (
      <InviteShell title={_('This link did not work')}>
        <Notice tone='error'>
          {result.error === 'network'
            ? _('Could not reach the server. Check your connection and try again.')
            : inviteErrorMessage(_, result.error)}
        </Notice>
        {result.error === 'expired' && (
          <p className='text-base-content/70 text-center text-sm'>
            {_('Open your status page and choose "Send the email again".')}
          </p>
        )}
        {savedCode && (
          <button
            className={SECONDARY_BUTTON_CLASS}
            onClick={() => router.push(`/join?code=${encodeURIComponent(savedCode)}`)}
          >
            {_('See its status')}
          </button>
        )}
        <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
          {_('Go to sign in')}
        </button>
      </InviteShell>
    );
  }

  if (result.active) {
    return (
      <InviteShell
        title={_('Your account is ready')}
        subtitle={_('Sign in with {{email}} and the password you chose.', {
          email: result.email ?? '',
        })}
      >
        <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
          {_('Go to sign in')}
        </button>
      </InviteShell>
    );
  }

  return (
    <InviteShell
      title={_('Email verified')}
      subtitle={_(
        'Thanks. Your request now waits for an admin to approve it. We will email you when your account is ready.',
      )}
    >
      <Notice tone='info'>{_('You can close this page.')}</Notice>
    </InviteShell>
  );
}

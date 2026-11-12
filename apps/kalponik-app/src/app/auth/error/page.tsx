'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import InviteShell, {
  Notice,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/app/join/InviteShell';

// Where a failed sign-in lands. Kalponik is invite-only, so the usual reason
// is a Google sign-in for an account that doesn't exist yet: Supabase answers
// `signup_disabled`. Say so, instead of bouncing back to the sign-in page.

const readErrorCode = () => {
  if (typeof window === 'undefined') return '';
  const params = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  return params.get('error_code') || hash.get('error_code') || params.get('error') || '';
};

export default function AuthErrorPage() {
  const _ = useTranslation();
  const router = useRouter();
  const [code, setCode] = useState('');

  useEffect(() => setCode(readErrorCode()), []);

  const noAccount = code === 'signup_disabled' || code === 'user_not_found';

  return (
    <InviteShell
      title={noAccount ? _('No account for this sign-in') : _('Sign-in did not work')}
      subtitle={
        noAccount
          ? _('Kalponik is invite-only, and there is no account for that address yet.')
          : _('Something went wrong while signing you in. Please try again.')
      }
    >
      {noAccount && (
        <Notice tone='info'>
          {_(
            'If you have an invite link, open it to create your account first. If you were invited with Google, sign in with the same Google account you gave. Otherwise, ask for access.',
          )}
        </Notice>
      )}
      <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
        {_('Back to sign in')}
      </button>
      {noAccount && (
        <button className={SECONDARY_BUTTON_CLASS} onClick={() => router.push('/request-access')}>
          {_('Request access')}
        </button>
      )}
      {code && !noAccount && (
        <p className='text-base-content/50 text-center text-xs'>
          {_('Error code: {{code}}', { code })}
        </p>
      )}
    </InviteShell>
  );
}

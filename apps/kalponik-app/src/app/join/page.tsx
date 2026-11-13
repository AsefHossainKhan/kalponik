'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IoCheckmarkCircle, IoEllipseOutline } from 'react-icons/io5';
import { useAuth } from '@/context/AuthContext';
import { useTranslation } from '@/hooks/useTranslation';
import { supabase } from '@/utils/supabase';
import InviteShell, {
  INPUT_CLASS,
  LINK_CLASS,
  Notice,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from './InviteShell';
import PasswordFields from './PasswordFields';
import {
  KALPONIK_APK_URL,
  fetchInviteStatus,
  getWebAppUrl,
  inviteErrorMessage,
  postJoin,
  postResendVerification,
  saveRequestCode,
  type InviteStatus,
} from './inviteClient';

// /join?code=...  The page behind an invite link, and the status page of an
// access request.
//
//   * An invite that can be used: create the account (email and password).
//   * An account waiting to unlock: what is still missing (verify the email,
//     an admin's approval), with "Send the email again" and "Check again".
//   * An unlocked account: "Your account is ready" and the way to sign in.

const readCode = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('code') ?? '';
};

function Step({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className='flex items-start gap-2.5 text-sm leading-relaxed'>
      {done ? (
        <IoCheckmarkCircle className='text-success mt-0.5 h-5 w-5 shrink-0' aria-hidden='true' />
      ) : (
        <IoEllipseOutline
          className='text-base-content/40 mt-0.5 h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      )}
      <span>{children}</span>
    </li>
  );
}

function GetKalponik() {
  const _ = useTranslation();
  return (
    <section className='flex flex-col gap-2.5'>
      <h2 className='text-sm font-semibold'>{_('Get Kalponik')}</h2>
      <a className={SECONDARY_BUTTON_CLASS} href={KALPONIK_APK_URL}>
        {_('Download the Android app')}
      </a>
      <p className='text-base-content/70 text-center text-sm'>
        {_('Or read in your browser at')}{' '}
        <a className={LINK_CLASS} href={getWebAppUrl()}>
          {getWebAppUrl().replace(/^https?:\/\//, '')}
        </a>
      </p>
    </section>
  );
}

export default function JoinPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [resendError, setResendError] = useState('');

  const load = useCallback(async (c: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const { ok, body } = await fetchInviteStatus(c);
      if (!ok) {
        setStatus(null);
        setLoadError(body.error ?? 'invalid_code');
      } else {
        setStatus(body);
        if (body.kind === 'request') saveRequestCode(c);
        if (body.email) setEmail(body.email);
      }
    } catch {
      setLoadError('network');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const c = readCode();
    setCode(c);
    if (c) load(c);
    else {
      setLoading(false);
      setLoadError('invalid_code');
    }
  }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (password !== confirm) {
      setFormError(_('The passwords do not match.'));
      return;
    }
    setSubmitting(true);
    try {
      const { ok, body } = await postJoin({ code, email, password });
      if (!ok) {
        setFormError(inviteErrorMessage(_, body.error));
        return;
      }
      if (body.active) {
        // No email to verify on this server: the account is ready now.
        const { data, error } = await supabase.auth.signInWithPassword({
          email: body.email,
          password,
        });
        if (!error && data.session) {
          login(data.session.access_token, data.session.user);
          router.push('/library');
          return;
        }
      }
      await load(code);
    } catch {
      setFormError(inviteErrorMessage(_, undefined));
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResendState('sending');
    setResendError('');
    try {
      const { ok, body } = await postResendVerification(code);
      if (!ok) {
        setResendError(inviteErrorMessage(_, body.error));
        setResendState('idle');
        return;
      }
      setResendState('sent');
    } catch {
      setResendError(_('Could not reach the server. Check your connection and try again.'));
      setResendState('idle');
    }
  };

  if (loading) {
    return (
      <InviteShell title={_('Join Kalponik')}>
        <div className='flex justify-center py-6'>
          <span className='loading loading-spinner loading-md' aria-label={_('Loading')} />
        </div>
      </InviteShell>
    );
  }

  if (loadError || !status) {
    return (
      <InviteShell title={_('Join Kalponik')}>
        <Notice tone='error'>
          {loadError === 'network'
            ? _('Could not reach the server. Check your connection and try again.')
            : inviteErrorMessage(_, loadError ?? undefined)}
        </Notice>
        <button className={SECONDARY_BUTTON_CLASS} onClick={() => router.push('/request-access')}>
          {_('Request access')}
        </button>
      </InviteShell>
    );
  }

  const { account } = status;

  if (account?.active) {
    return (
      <InviteShell
        title={_('Your account is ready')}
        subtitle={_('Sign in with {{email}} and the password you chose.', {
          email: status.email ?? '',
        })}
      >
        <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
          {_('Go to sign in')}
        </button>
        <GetKalponik />
      </InviteShell>
    );
  }

  if (account) {
    const needsApproval = status.kind === 'request';
    return (
      <InviteShell
        title={_('Almost there')}
        subtitle={_('Your account for {{email}} is made, and opens once these are done:', {
          email: status.email ?? '',
        })}
      >
        <ul className='flex flex-col gap-3'>
          <Step done={account.verified}>
            {account.verified
              ? _('Email verified')
              : _('Verify your email: open the link we sent to {{email}}.', {
                  email: status.email ?? '',
                })}
          </Step>
          {needsApproval && (
            <Step done={account.approved}>
              {account.approved ? _('Request approved') : _('An admin approves your request')}
            </Step>
          )}
        </ul>
        {status.mail && (
          <Notice tone='info'>
            {_('We will email you when your account is ready. Then just sign in.')}
          </Notice>
        )}
        {!account.verified && status.mail && (
          <div className='flex flex-col gap-2'>
            <button
              className={SECONDARY_BUTTON_CLASS}
              onClick={resend}
              disabled={resendState !== 'idle'}
            >
              {resendState === 'sent'
                ? _('Sent. Check your inbox and spam folder.')
                : resendState === 'sending'
                  ? _('Sending...')
                  : _('Send the email again')}
            </button>
            {resendError && <Notice tone='error'>{resendError}</Notice>}
          </div>
        )}
        <button className={SECONDARY_BUTTON_CLASS} onClick={() => load(code)}>
          {_('Check again')}
        </button>
      </InviteShell>
    );
  }

  if (status.state === 'pending') {
    // A request made before accounts were created up front.
    return (
      <InviteShell
        title={_('Request sent')}
        subtitle={_('Your request for {{email}} is waiting for approval.', {
          email: status.email ?? '',
        })}
      >
        <Notice tone='info'>
          {_(
            'Keep this page: bookmark it or save the link. Once your request is approved, this is where you create your account.',
          )}
        </Notice>
        <button className={SECONDARY_BUTTON_CLASS} onClick={() => load(code)}>
          {_('Check again')}
        </button>
      </InviteShell>
    );
  }

  if (status.state !== 'approved') {
    return (
      <InviteShell title={_('Join Kalponik')}>
        <Notice tone='error'>{inviteErrorMessage(_, status.state)}</Notice>
        {status.state === 'used' ? (
          <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
            {_('Go to sign in')}
          </button>
        ) : (
          <button className={SECONDARY_BUTTON_CLASS} onClick={() => router.push('/request-access')}>
            {_('Request access')}
          </button>
        )}
      </InviteShell>
    );
  }

  const emailLocked = status.kind === 'request';

  return (
    <InviteShell
      title={status.kind === 'request' ? _('You are approved') : _("You're invited to Kalponik")}
      subtitle={_('Create your account once, then read on the web or on Android.')}
    >
      <form className='flex flex-col gap-3' onSubmit={handleSubmit}>
        <h2 className='text-sm font-semibold'>{_('Create your account')}</h2>
        <label className='flex flex-col gap-1.5 text-sm'>
          {_('Your email address')}
          <input
            className={INPUT_CLASS}
            type='email'
            name='email'
            autoComplete='email'
            required
            value={email}
            readOnly={emailLocked}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        <p className='text-base-content/70 text-xs leading-relaxed'>
          {_(
            'Any email address works. With a Gmail address, Sign in with Google works too; any other address can link Google later on the account page.',
          )}
        </p>
        {formError && <Notice tone='error'>{formError}</Notice>}
        <button className={PRIMARY_BUTTON_CLASS} type='submit' disabled={submitting}>
          {submitting ? _('Creating your account...') : _('Create account')}
        </button>
      </form>
      <GetKalponik />
    </InviteShell>
  );
}

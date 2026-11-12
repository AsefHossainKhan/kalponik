'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FcGoogle } from 'react-icons/fc';
import { MdOutlineEmail } from 'react-icons/md';
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
import {
  KALPONIK_APK_URL,
  fetchInviteStatus,
  getWebAppUrl,
  inviteErrorMessage,
  postJoin,
  saveRequestCode,
  type InviteStatus,
} from './inviteClient';

// /join?code=...  The page behind an invite link, and the status page of an
// access request. Once the invite is approved the visitor creates their one
// account here: email and password, or Google.

type Method = 'google' | 'password';

const readCode = () => {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('code') ?? '';
};

export default function JoinPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<InviteStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [method, setMethod] = useState<Method>('google');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [googleReadyFor, setGoogleReadyFor] = useState<string | null>(null);

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

  const emailLocked = status?.kind === 'request';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (method === 'password' && password !== confirm) {
      setFormError(_('The passwords do not match.'));
      return;
    }
    setSubmitting(true);
    try {
      const { ok, body } = await postJoin({
        code,
        email,
        password: method === 'password' ? password : undefined,
      });
      if (!ok) {
        setFormError(inviteErrorMessage(_, body.error));
        return;
      }
      if (method === 'google') {
        setGoogleReadyFor(body.email);
        return;
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email: body.email,
        password,
      });
      if (error || !data.session) {
        // The account exists; only the automatic sign-in failed.
        router.push('/auth');
        return;
      }
      login(data.session.access_token, data.session.user);
      router.push('/library');
    } catch {
      setFormError(inviteErrorMessage(_, undefined));
    } finally {
      setSubmitting(false);
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

  if (googleReadyFor) {
    return (
      <InviteShell
        title={_('Your account is ready')}
        subtitle={_('Sign in with Google using {{email}}.', { email: googleReadyFor })}
      >
        <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
          {_('Go to sign in')}
        </button>
      </InviteShell>
    );
  }

  if (status.state === 'pending') {
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

  return (
    <InviteShell
      title={status.kind === 'request' ? _('You are approved') : _("You're invited to Kalponik")}
      subtitle={_('Create your account once, then read on the web or on Android.')}
    >
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

      <form className='flex flex-col gap-3' onSubmit={handleSubmit}>
        <h2 className='text-sm font-semibold'>{_('Create your account')}</h2>
        <div className='grid grid-cols-2 gap-2' role='tablist'>
          <button
            type='button'
            role='tab'
            aria-selected={method === 'google'}
            className={`btn h-11 min-h-11 rounded-lg ${method === 'google' ? 'btn-active' : 'btn-ghost eink-bordered border-base-300'}`}
            onClick={() => setMethod('google')}
          >
            <FcGoogle className='h-5 w-5' /> Google
          </button>
          <button
            type='button'
            role='tab'
            aria-selected={method === 'password'}
            className={`btn h-11 min-h-11 rounded-lg ${method === 'password' ? 'btn-active' : 'btn-ghost eink-bordered border-base-300'}`}
            onClick={() => setMethod('password')}
          >
            <MdOutlineEmail className='h-5 w-5' /> {_('Email')}
          </button>
        </div>

        <label className='flex flex-col gap-1.5 text-sm'>
          {method === 'google' ? _('Your Google (Gmail) address') : _('Your email address')}
          <input
            className={INPUT_CLASS}
            type='email'
            autoComplete='email'
            required
            value={email}
            readOnly={emailLocked}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {method === 'google' && (
          <p className='text-base-content/70 text-xs leading-relaxed'>
            {_('Afterwards, sign in with the Google account that has this address.')}
          </p>
        )}
        {method === 'password' && (
          <>
            <label className='flex flex-col gap-1.5 text-sm'>
              {_('Create a Password')}
              <input
                className={INPUT_CLASS}
                type='password'
                autoComplete='new-password'
                minLength={8}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className='flex flex-col gap-1.5 text-sm'>
              {_('Repeat the password')}
              <input
                className={INPUT_CLASS}
                type='password'
                autoComplete='new-password'
                minLength={8}
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
          </>
        )}
        {formError && <Notice tone='error'>{formError}</Notice>}
        <button className={PRIMARY_BUTTON_CLASS} type='submit' disabled={submitting}>
          {submitting ? _('Creating your account...') : _('Create account')}
        </button>
      </form>
    </InviteShell>
  );
}

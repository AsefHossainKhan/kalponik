'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import InviteShell, {
  INPUT_CLASS,
  LINK_CLASS,
  Notice,
  PRIMARY_BUTTON_CLASS,
} from '@/app/join/InviteShell';
import {
  inviteErrorMessage,
  postAccessRequest,
  readSavedRequestCode,
  saveRequestCode,
} from '@/app/join/inviteClient';

// /request-access  Ask for an account. No account is created here: the
// request waits on the admin page, and the visitor's status page
// (/join?code=...) turns into the sign-up page once it is approved.

export default function RequestAccessPage() {
  const _ = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedCode, setSavedCode] = useState<string | null>(null);

  useEffect(() => setSavedCode(readSavedRequestCode()), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { ok, body } = await postAccessRequest({ email, note, website });
      if (!ok || !body.code) {
        setError(inviteErrorMessage(_, body.error));
        return;
      }
      saveRequestCode(body.code);
      router.push(`/join?code=${encodeURIComponent(body.code)}`);
    } catch {
      setError(_('Could not reach the server. Check your connection and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <InviteShell
      title={_('Request access')}
      subtitle={_(
        'Kalponik is invite-only. Leave your email and a short note; requests are approved by hand.',
      )}
    >
      {savedCode && (
        <Notice tone='info'>
          {_('You already sent a request from this device.')}{' '}
          <button
            type='button'
            className={LINK_CLASS}
            onClick={() => router.push(`/join?code=${encodeURIComponent(savedCode)}`)}
          >
            {_('See its status')}
          </button>
        </Notice>
      )}
      <form className='flex flex-col gap-3' onSubmit={handleSubmit}>
        <label className='flex flex-col gap-1.5 text-sm'>
          {_('Your email address')}
          <input
            className={INPUT_CLASS}
            type='email'
            autoComplete='email'
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <p className='text-base-content/70 -mt-1 text-xs leading-relaxed'>
          {_('To sign in with Google later, use your Gmail address.')}
        </p>
        <label className='flex flex-col gap-1.5 text-sm'>
          {_('Who are you? (optional)')}
          <textarea
            className='textarea textarea-bordered eink-bordered bg-base-100 min-h-20 w-full rounded-lg text-base'
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {/* Bots fill every field; people never see this one. */}
        <input
          className='hidden'
          type='text'
          name='website'
          tabIndex={-1}
          autoComplete='off'
          aria-hidden='true'
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        {error && <Notice tone='error'>{error}</Notice>}
        <button className={PRIMARY_BUTTON_CLASS} type='submit' disabled={submitting}>
          {submitting ? _('Sending...') : _('Send request')}
        </button>
      </form>
      <div className='flex flex-col items-center gap-2 text-sm'>
        <button type='button' className={LINK_CLASS} onClick={() => router.push('/auth')}>
          {_('Already have an account? Sign in')}
        </button>
      </div>
    </InviteShell>
  );
}

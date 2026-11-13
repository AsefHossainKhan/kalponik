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
import PasswordFields from '@/app/join/PasswordFields';
import {
  inviteErrorMessage,
  postAccessRequest,
  readSavedRequestCode,
  saveRequestCode,
} from '@/app/join/inviteClient';

// /request-access  Ask for an account. The account is created here, with the
// password chosen here, but stays locked until the email is verified (a link
// we email) and an admin approves the request. The visitor's status page
// (/join?code=...) shows how far along it is; once it is unlocked they get an
// email and simply sign in.

export default function RequestAccessPage() {
  const _ = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [savedCode, setSavedCode] = useState<string | null>(null);

  useEffect(() => setSavedCode(readSavedRequestCode()), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(_('The passwords do not match.'));
      return;
    }
    setSubmitting(true);
    try {
      const { ok, body } = await postAccessRequest({ email, password, note, website });
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
        'Kalponik is invite-only. Choose your email and password now; requests are approved by hand, and you get an email once your account is ready.',
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
            name='email'
            autoComplete='email'
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        <label className='flex flex-col gap-1.5 text-sm'>
          {_('Who are you? (optional)')}
          <textarea
            className='textarea textarea-bordered eink-bordered bg-base-100 min-h-20 w-full rounded-lg text-base'
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <p className='text-base-content/70 -mt-1 text-xs leading-relaxed'>
          {_(
            'With a Gmail address, Sign in with Google also works once your account is ready. Any other address can link Google later on the account page.',
          )}
        </p>
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

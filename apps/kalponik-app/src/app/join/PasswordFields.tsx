'use client';

import { useTranslation } from '@/hooks/useTranslation';
import { INPUT_CLASS } from './InviteShell';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './inviteClient';

// "Create a password" and "Repeat the password", for asking for access and
// for joining with an invite link.
export default function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
}) {
  const _ = useTranslation();
  return (
    <>
      <label className='flex flex-col gap-1.5 text-sm'>
        {_('Create a Password')}
        <input
          className={INPUT_CLASS}
          type='password'
          name='new-password'
          autoComplete='new-password'
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => onPassword(e.target.value)}
        />
      </label>
      <label className='flex flex-col gap-1.5 text-sm'>
        {_('Repeat the password')}
        <input
          className={INPUT_CLASS}
          type='password'
          name='confirm-password'
          autoComplete='new-password'
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          required
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
        />
      </label>
      <p className='text-base-content/70 -mt-1 text-xs leading-relaxed'>
        {_('At least 8 characters.')}
      </p>
    </>
  );
}

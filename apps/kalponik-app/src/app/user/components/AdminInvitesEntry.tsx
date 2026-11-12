'use client';

import { PiShieldCheck } from 'react-icons/pi';
import { useTranslation } from '@/hooks/useTranslation';
import { useAdminStatus } from '@/hooks/useAdminStatus';

// Kalponik: the way into /admin from the account page, shown only to admins,
// with the number of access requests waiting. The Android app has no address
// bar, so it needs this (and the Admin item in the library menu).
export default function AdminInvitesEntry({ onOpen }: { onOpen: () => void }) {
  const _ = useTranslation();
  const { isAdmin, pending } = useAdminStatus();

  if (!isAdmin) return null;

  return (
    <button
      className='btn btn-ghost eink-bordered border-base-300 h-12 min-h-12 w-full justify-between rounded-xl'
      onClick={onOpen}
    >
      <span className='flex items-center gap-2'>
        <PiShieldCheck className='h-5 w-5' />
        {_('Admin')}
      </span>
      {pending > 0 && (
        <span className='badge badge-primary'>{_('{{count}} waiting', { count: pending })}</span>
      )}
    </button>
  );
}

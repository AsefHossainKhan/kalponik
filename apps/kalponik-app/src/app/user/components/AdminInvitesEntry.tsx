'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { getAPIBaseUrl } from '@/services/environment';

// Kalponik: the way into /admin from the account page, shown only to
// admins (the server answers 403 to everyone else), with the number of access
// requests waiting. The Android app has no address bar, so it needs this.
export default function AdminInvitesEntry({
  token,
  onOpen,
}: {
  token: string | null;
  onOpen: () => void;
}) {
  const _ = useTranslation();
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${getAPIBaseUrl()}/admin/invites`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) return;
        const body = (await response.json()) as { pending?: unknown[] };
        if (!cancelled) setPending(body.pending?.length ?? 0);
      } catch {
        // Not an admin, or offline: show nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (pending === null) return null;

  return (
    <button
      className='btn btn-ghost eink-bordered border-base-300 h-12 min-h-12 w-full justify-between rounded-xl'
      onClick={onOpen}
    >
      <span>{_('Invites and requests')}</span>
      {pending > 0 && (
        <span className='badge badge-primary'>{_('{{count}} waiting', { count: pending })}</span>
      )}
    </button>
  );
}

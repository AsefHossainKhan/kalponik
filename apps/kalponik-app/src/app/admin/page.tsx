'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IoArrowBack } from 'react-icons/io5';
import { useTranslation } from '@/hooks/useTranslation';
import { useUserActions } from '@/hooks/useUserActions';
import { getAccessToken } from '@/utils/access';
import { getAPIBaseUrl } from '@/services/environment';
import InviteShell, {
  INPUT_CLASS,
  LINK_CLASS,
  Notice,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/app/join/InviteShell';
import { getJoinUrl } from '@/app/join/inviteClient';

// /admin  The admins' page for invite-only sign-up: approve or decline access
// requests, make invite links to share, cancel ones not used yet. The server
// decides who is an admin: the root admin(s) in KALPONIK_ADMINS plus admins added
// in the Admins section.

interface AdminInvite {
  id: string;
  kind: 'link' | 'request';
  state: 'pending' | 'approved' | 'declined' | 'revoked' | 'used' | 'expired';
  email: string | null;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  usedAt: string | null;
  hasAccount: boolean;
  verified: boolean;
  active: boolean;
}

interface AdminList {
  pending: AdminInvite[];
  waiting: AdminInvite[];
  active: AdminInvite[];
  recent: AdminInvite[];
}

interface AdminPrefs {
  notifyRequests: boolean;
  mail: boolean;
}

type LoadState = 'loading' | 'ready' | 'signed_out' | 'not_admin' | 'error';

interface AdminEntry {
  id: string | null;
  email: string | null;
  root: boolean;
  addedAt: string | null;
}

const adminCall = async (init?: RequestInit, route: 'invites' | 'admins' | 'prefs' = 'invites') => {
  const token = await getAccessToken();
  if (!token) return { status: 401, body: {} as Record<string, unknown> };
  const response = await fetch(`${getAPIBaseUrl()}/admin/${route}`, {
    ...init,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
};

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';

export default function AdminPage() {
  const _ = useTranslation();
  const router = useRouter();
  const { handleLogout } = useUserActions();
  const [state, setState] = useState<LoadState>('loading');
  const [list, setList] = useState<AdminList>({
    pending: [],
    waiting: [],
    active: [],
    recent: [],
  });
  const [prefs, setPrefs] = useState<AdminPrefs | null>(null);
  const [prefsError, setPrefsError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [note, setNote] = useState('');
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [admins, setAdmins] = useState<AdminEntry[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminError, setAdminError] = useState('');

  const load = useCallback(async () => {
    try {
      const [invites, team, mine] = await Promise.all([
        adminCall(),
        adminCall(undefined, 'admins').catch(() => null),
        adminCall(undefined, 'prefs').catch(() => null),
      ]);
      const { status, body } = invites;
      if (status === 401) return setState('signed_out');
      if (status === 403) return setState('not_admin');
      if (status !== 200) return setState('error');
      setList(body as unknown as AdminList);
      if (mine?.status === 200) setPrefs(mine.body as unknown as AdminPrefs);
      if (team?.status === 200) {
        setAdmins((team.body['admins'] as AdminEntry[]) ?? []);
        setMe((team.body['me'] as string) ?? null);
      }
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  const adminErrorMessage = (error: unknown) => {
    switch (error) {
      case 'invalid_email':
        return _('Please enter a valid email address.');
      case 'no_account':
        return _('There is no account with that email. Invite them first.');
      case 'already_admin':
        return _('They are already an admin.');
      case 'root_admin':
        return _('Root admins are set on the server and cannot be removed here.');
      case 'self':
        return _('You cannot remove yourself.');
      default:
        return _('That did not work. The list was refreshed.');
    }
  };

  const changeAdmins = async (body: Record<string, string>, busyKey: string) => {
    setBusyId(busyKey);
    setAdminError('');
    try {
      const { status, body: result } = await adminCall(
        { method: 'POST', body: JSON.stringify(body) },
        'admins',
      );
      if (status !== 200) {
        setAdminError(adminErrorMessage(result['error']));
        return false;
      }
      return true;
    } catch {
      setAdminError(_('Could not reach the server. Check your connection and try again.'));
      return false;
    } finally {
      setBusyId(null);
      load();
    }
  };

  const addAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await changeAdmins({ action: 'add', email: adminEmail }, 'add-admin')) setAdminEmail('');
  };

  useEffect(() => {
    load();
  }, [load]);

  const setNotifyRequests = async (notifyRequests: boolean) => {
    setBusyId('prefs');
    setPrefsError('');
    try {
      const { status, body } = await adminCall(
        { method: 'POST', body: JSON.stringify({ notifyRequests }) },
        'prefs',
      );
      if (status !== 200) {
        setPrefsError(_('Could not save the setting.'));
        return;
      }
      setPrefs(body as unknown as AdminPrefs);
    } catch {
      setPrefsError(_('Could not reach the server. Check your connection and try again.'));
    } finally {
      setBusyId(null);
    }
  };

  const act = async (id: string, action: 'approve' | 'decline' | 'revoke') => {
    setBusyId(id);
    setActionError('');
    try {
      const { status } = await adminCall({ method: 'POST', body: JSON.stringify({ action, id }) });
      if (status !== 200) setActionError(_('That did not work. The list was refreshed.'));
    } catch {
      setActionError(_('Could not reach the server. Check your connection and try again.'));
    } finally {
      setBusyId(null);
      load();
    }
  };

  const createLink = async () => {
    setBusyId('new');
    setActionError('');
    setCopied(false);
    try {
      const { status, body } = await adminCall({
        method: 'POST',
        body: JSON.stringify({ action: 'create', note }),
      });
      if (status !== 200 || typeof body['code'] !== 'string') {
        setActionError(_('Could not create the invite.'));
        return;
      }
      setNewLink(getJoinUrl(body['code']));
      setNote('');
    } catch {
      setActionError(_('Could not reach the server. Check your connection and try again.'));
    } finally {
      setBusyId(null);
      load();
    }
  };

  const copyLink = async () => {
    if (!newLink) return;
    try {
      await navigator.clipboard.writeText(newLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const shareLink = async () => {
    if (!newLink) return;
    try {
      await navigator.share({
        title: _('Join Kalponik'),
        text: _('Your invite to Kalponik'),
        url: newLink,
      });
    } catch {
      // Cancelled, or no share sheet: the link is on screen to copy.
    }
  };

  const topBar = (
    <>
      <button
        className='btn btn-ghost h-10 min-h-10 gap-1.5 rounded-lg px-2'
        onClick={() => router.push('/user')}
      >
        <IoArrowBack className='h-5 w-5' />
        {_('Account')}
      </button>
      <button
        className='btn btn-ghost eink-bordered border-base-300 h-10 min-h-10 rounded-lg px-3'
        onClick={handleLogout}
      >
        {_('Sign Out')}
      </button>
    </>
  );

  if (state !== 'ready') {
    return (
      <InviteShell title={_('Admin')} topBar={state === 'signed_out' ? undefined : topBar}>
        {state === 'loading' && (
          <div className='flex justify-center py-6'>
            <span className='loading loading-spinner loading-md' aria-label={_('Loading')} />
          </div>
        )}
        {state === 'signed_out' && (
          <button className={PRIMARY_BUTTON_CLASS} onClick={() => router.push('/auth')}>
            {_('Sign in')}
          </button>
        )}
        {state === 'not_admin' && (
          <Notice tone='error'>{_('Only admins can open this page.')}</Notice>
        )}
        {state === 'error' && (
          <>
            <Notice tone='error'>{_('Something went wrong. Please try again.')}</Notice>
            <button className={SECONDARY_BUTTON_CLASS} onClick={load}>
              {_('Try again')}
            </button>
          </>
        )}
      </InviteShell>
    );
  }

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  return (
    <InviteShell title={_('Admin')} wide topBar={topBar}>
      {actionError && <Notice tone='error'>{actionError}</Notice>}

      <section className='flex flex-col gap-3'>
        <h2 className='text-base font-semibold'>
          {_('Waiting for you')} {list.pending.length > 0 && `(${list.pending.length})`}
        </h2>
        {list.pending.length === 0 && (
          <p className='text-base-content/70 text-sm'>{_('No requests waiting.')}</p>
        )}
        {list.pending.map((r) => (
          <div
            key={r.id}
            className='eink-bordered border-base-300 flex flex-col gap-2 rounded-lg border p-3'
          >
            <div className='flex flex-wrap items-center gap-2'>
              <span className='break-all font-medium'>{r.email}</span>
              {r.hasAccount && (
                <span className={`badge badge-sm ${r.verified ? 'badge-success' : 'badge-ghost'}`}>
                  {r.verified ? _('Email verified') : _('Email not verified yet')}
                </span>
              )}
            </div>
            {r.note && <p className='text-sm whitespace-pre-wrap'>{r.note}</p>}
            <div className='text-base-content/60 text-xs'>{formatDate(r.createdAt)}</div>
            <div className='grid grid-cols-2 gap-2'>
              <button
                className='btn btn-primary h-10 min-h-10 rounded-lg'
                disabled={busyId === r.id}
                onClick={() => act(r.id, 'approve')}
              >
                {_('Approve')}
              </button>
              <button
                className='btn btn-ghost eink-bordered border-base-300 h-10 min-h-10 rounded-lg'
                disabled={busyId === r.id}
                onClick={() => act(r.id, 'decline')}
              >
                {_('Decline')}
              </button>
            </div>
          </div>
        ))}
      </section>

      {list.waiting.length > 0 && (
        <section className='flex flex-col gap-3'>
          <h2 className='text-base font-semibold'>{_('Waiting for their email')}</h2>
          <p className='text-base-content/70 text-sm'>
            {_('Approved or invited, with an account that opens once they verify their email.')}
          </p>
          {list.waiting.map((r) => (
            <div
              key={r.id}
              className='eink-bordered border-base-300 flex items-center gap-3 rounded-lg border p-3'
            >
              <div className='min-w-0 flex-1'>
                <div className='truncate text-sm font-medium'>{r.email}</div>
                <div className='text-base-content/60 text-xs'>
                  {r.kind === 'request' ? _('Approved request') : r.note || _('Invite link')} ·{' '}
                  {formatDate(r.usedAt)}
                </div>
              </div>
              <button
                className='btn btn-ghost btn-sm eink-bordered border-base-300 rounded-lg'
                disabled={busyId === r.id}
                onClick={() => act(r.id, 'revoke')}
              >
                {_('Cancel')}
              </button>
            </div>
          ))}
        </section>
      )}

      <section className='flex flex-col gap-3'>
        <h2 className='text-base font-semibold'>{_('New invite link')}</h2>
        <p className='text-base-content/70 text-sm'>
          {_('Works once, for any email, for 7 days.')}
        </p>
        <input
          className={INPUT_CLASS}
          placeholder={_('Who is it for? (optional)')}
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
        />
        <button className={PRIMARY_BUTTON_CLASS} disabled={busyId === 'new'} onClick={createLink}>
          {_('Create invite link')}
        </button>
        {newLink && (
          <div className='eink-bordered border-base-300 bg-base-200/60 flex flex-col gap-2 rounded-lg border p-3'>
            <code className='text-sm break-all select-all'>{newLink}</code>
            <div className={`grid gap-2 ${canShare ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <button
                className='btn btn-ghost eink-bordered border-base-300 h-10 min-h-10 rounded-lg'
                onClick={copyLink}
              >
                {copied ? _('Copied') : _('Copy')}
              </button>
              {canShare && (
                <button
                  className='btn btn-ghost eink-bordered border-base-300 h-10 min-h-10 rounded-lg'
                  onClick={shareLink}
                >
                  {_('Share')}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section className='flex flex-col gap-3'>
        <h2 className='text-base font-semibold'>{_('Not used yet')}</h2>
        {list.active.length === 0 && (
          <p className='text-base-content/70 text-sm'>{_('No open invites.')}</p>
        )}
        {list.active.map((r) => (
          <div
            key={r.id}
            className='eink-bordered border-base-300 flex items-center gap-3 rounded-lg border p-3'
          >
            <div className='min-w-0 flex-1'>
              <div className='truncate text-sm font-medium'>
                {r.kind === 'request' ? r.email : r.note || _('Invite link')}
              </div>
              <div className='text-base-content/60 text-xs'>
                {r.kind === 'request' ? _('Approved request') : _('Invite link')} ·{' '}
                {_('expires {{date}}', { date: formatDate(r.expiresAt) })}
              </div>
            </div>
            <button
              className='btn btn-ghost btn-sm eink-bordered border-base-300 rounded-lg'
              disabled={busyId === r.id}
              onClick={() => act(r.id, 'revoke')}
            >
              {_('Cancel')}
            </button>
          </div>
        ))}
      </section>

      {list.recent.length > 0 && (
        <section className='flex flex-col gap-2'>
          <h2 className='text-base font-semibold'>{_('Recent')}</h2>
          {list.recent.map((r) => (
            <div key={r.id} className='text-base-content/70 flex justify-between gap-3 text-sm'>
              <span className='truncate'>{r.email || r.note || _('Invite link')}</span>
              <span className='shrink-0'>
                {
                  {
                    used: _('joined'),
                    declined: _('declined'),
                    revoked: _('cancelled'),
                    expired: _('expired'),
                    pending: '',
                    approved: '',
                  }[r.state]
                }
              </span>
            </div>
          ))}
        </section>
      )}

      <section className='flex flex-col gap-3'>
        <h2 className='text-base font-semibold'>{_('Admins')}</h2>
        <p className='text-base-content/70 text-sm'>
          {_('Admins can approve requests, make invite links and add other admins.')}
        </p>
        {admins.map((a) => (
          <div
            key={a.id ?? a.email ?? ''}
            className='eink-bordered border-base-300 flex items-center gap-3 rounded-lg border p-3'
          >
            <div className='min-w-0 flex-1'>
              <div className='truncate text-sm font-medium'>{a.email ?? a.id}</div>
              <div className='text-base-content/60 text-xs'>
                {a.root
                  ? _('Root admin (set on the server)')
                  : _('Added {{date}}', { date: formatDate(a.addedAt) })}
                {a.id && a.id === me ? ` · ${_('you')}` : ''}
              </div>
            </div>
            {!a.root && a.id && a.id !== me && (
              <button
                className='btn btn-ghost btn-sm eink-bordered border-base-300 rounded-lg'
                disabled={busyId === `admin-${a.id}`}
                onClick={() => changeAdmins({ action: 'remove', userId: a.id! }, `admin-${a.id}`)}
              >
                {_('Remove')}
              </button>
            )}
          </div>
        ))}
        <form className='flex flex-col gap-2' onSubmit={addAdmin}>
          <input
            className={INPUT_CLASS}
            type='email'
            required
            placeholder={_('Email of an existing account')}
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
          />
          <button
            className={SECONDARY_BUTTON_CLASS}
            type='submit'
            disabled={busyId === 'add-admin'}
          >
            {_('Add admin')}
          </button>
        </form>
        {adminError && <Notice tone='error'>{adminError}</Notice>}
      </section>

      {prefs && (
        <section className='flex flex-col gap-2'>
          <h2 className='text-base font-semibold'>{_('Notifications')}</h2>
          <label className='flex cursor-pointer items-center justify-between gap-3 text-sm'>
            <span>{_('Email me when someone asks for access')}</span>
            <input
              type='checkbox'
              className='toggle'
              checked={prefs.notifyRequests}
              disabled={busyId === 'prefs' || (!prefs.mail && !prefs.notifyRequests)}
              onChange={(e) => setNotifyRequests(e.target.checked)}
            />
          </label>
          {!prefs.mail && (
            <p className='text-base-content/70 text-xs leading-relaxed'>
              {_(
                'The server has no email set up yet, so it sends no email: no verification links, no notices.',
              )}
            </p>
          )}
          {prefsError && <Notice tone='error'>{prefsError}</Notice>}
        </section>
      )}

      <div className='flex justify-center gap-4 text-sm'>
        <button className={LINK_CLASS} onClick={load}>
          {_('Refresh')}
        </button>
        <button className={LINK_CLASS} onClick={() => router.push('/library')}>
          {_('Library')}
        </button>
      </div>
    </InviteShell>
  );
}

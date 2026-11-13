'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/hooks/useTranslation';
import InviteShell, { LINK_CLASS } from '@/app/join/InviteShell';

// /privacy  Kalponik's privacy policy. Public on purpose: Google's OAuth consent
// screen links here, and people read it before they have an account. Keep it
// true to what the app does; update the date when the content changes.

const CONTACT_EMAIL = 'kalponik.reader@gmail.com';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-2'>
      <h2 className='text-base font-semibold'>{title}</h2>
      <div className='text-base-content/85 flex flex-col gap-2 text-sm leading-relaxed'>
        {children}
      </div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className='flex list-disc flex-col gap-1.5 ps-5'>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export default function PrivacyPage() {
  const _ = useTranslation();
  const router = useRouter();
  const mail = (
    <a className={LINK_CLASS} href={`mailto:${CONTACT_EMAIL}`}>
      {CONTACT_EMAIL}
    </a>
  );

  return (
    <InviteShell
      wide
      title={_('Privacy Policy')}
      subtitle={_('Last updated {{date}}', { date: '13 November 2026' })}
    >
      <div className='flex flex-col gap-6 text-start'>
        <p className='text-sm leading-relaxed'>
          {_(
            'Kalponik is a private, invite-only e-book reader run by one person for themselves and the people they invite. It is not a business. This page says what Kalponik stores about you, where, and why.',
          )}
        </p>

        <Section title={_('What we store')}>
          <Bullets
            items={[
              _(
                'Your account: your email address and your password. The password is stored only as a secure hash; nobody can read it.',
              ),
              _(
                'If you sign in with Google: the name, email address and profile picture Google shares. Kalponik asks Google for nothing else; it cannot see your Gmail, Drive or contacts.',
              ),
              _(
                'Your access request: the note you write when you ask for an account, and whether your email is verified and your request approved.',
              ),
              _('The books you upload and their covers.'),
              _(
                'Your reading data: progress, bookmarks, highlights, notes and reader settings, so they sync between your devices.',
              ),
            ]}
          />
        </Section>

        <Section title={_('Where it is kept')}>
          <Bullets
            items={[
              _(
                'Accounts and reading data are kept in a database hosted by Supabase (supabase.com).',
              ),
              _(
                'Book files and covers are kept on a private server at the owner’s home, not with a cloud provider.',
              ),
              _(
                'Books you open on a device are also kept on that device, so you can read offline.',
              ),
            ]}
          />
        </Section>

        <Section title={_('Emails')}>
          <p>
            {_(
              'Kalponik sends a few emails through Gmail: a link to verify your email address, a note when your account is ready, and, to admins who turn it on, a note when someone asks for access. No newsletters and no marketing.',
            )}
          </p>
        </Section>

        <Section title={_('What we do not do')}>
          <Bullets
            items={[
              _('No ads, no analytics and no tracking.'),
              _('Your data is never sold or shared for marketing.'),
              _(
                'Your books and notes are not read by anyone else. The admins can see your email address and your access request, so they can approve it.',
              ),
            ]}
          />
        </Section>

        <Section title={_('Optional features')}>
          <p>
            {_(
              'Some features you can choose to use, such as translation, dictionary lookups and read-aloud voices, send the text you select to the service that provides them, only when you use them.',
            )}
          </p>
        </Section>

        <Section title={_('Deleting your data')}>
          <p>
            {_(
              'You can delete your books in the app at any time. To delete your account and everything stored with it, email the address below and it will be done within 30 days.',
            )}
          </p>
        </Section>

        <Section title={_('Contact')}>
          <p>
            {_('Questions about your data:')} {mail}
          </p>
        </Section>

        <div className='flex justify-center text-sm'>
          <button type='button' className={LINK_CLASS} onClick={() => router.push('/auth')}>
            {_('Back to sign in')}
          </button>
        </div>
      </div>
    </InviteShell>
  );
}

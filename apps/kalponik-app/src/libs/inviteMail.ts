// The emails invite-only sign-up sends (see invites.ts). Plain text, in
// English: they go out from the server, which doesn't know the reader's
// language.

/** The newest Android release. Stable name, attached by the release workflow. */
export const KALPONIK_APK_URL =
  process.env['NEXT_PUBLIC_KALPONIK_APK_URL'] ||
  'https://github.com/AsefHossainKhan/kalponik/releases/latest/download/Kalponik_arm64.apk';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/** Addresses the emails point at. */
export interface InviteLinks {
  /** The web app, e.g. https://kalponik.asroy.duckdns.org */
  webUrl: string;
  /** The newest Android APK. */
  apkUrl: string;
}

export const verifyUrl = (links: InviteLinks, token: string) =>
  `${links.webUrl}/verify-email?token=${encodeURIComponent(token)}`;

export const verifyEmailMail = (links: InviteLinks, to: string, token: string): MailMessage => ({
  to,
  subject: 'Confirm your email for Kalponik',
  text: [
    'Hi,',
    '',
    'Someone (hopefully you) used this address to ask for a Kalponik account.',
    'Open this link to confirm the address is yours:',
    '',
    verifyUrl(links, token),
    '',
    'The link works for 7 days. If this wasn’t you, ignore this email and no account will be made.',
    '',
    'Kalponik',
  ].join('\n'),
});

export const accountReadyMail = (links: InviteLinks, to: string): MailMessage => ({
  to,
  subject: 'Your Kalponik account is ready',
  text: [
    'Hi,',
    '',
    `Your Kalponik account is ready. Sign in with ${to} and the password you chose.`,
    '',
    `Read in your browser: ${links.webUrl}`,
    `Android app: ${links.apkUrl}`,
    '',
    'If your address is a Gmail address, “Sign in with Google” works too.',
    'Forgot the password? Use “Forgot your password?” on the sign-in page.',
    '',
    'Kalponik',
  ].join('\n'),
});

export const accessRequestMail = (
  links: InviteLinks,
  to: string,
  request: { email: string; note: string | null },
): MailMessage => ({
  to,
  subject: `Kalponik: access request from ${request.email}`,
  text: [
    `${request.email} asked for a Kalponik account.`,
    ...(request.note ? ['', 'Their note:', request.note] : []),
    '',
    `Approve or decline it: ${links.webUrl}/admin`,
    '',
    'You get this because “Email me about new requests” is on for you on the admin page.',
  ].join('\n'),
});

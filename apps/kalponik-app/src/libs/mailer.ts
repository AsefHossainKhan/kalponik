import nodemailer, { type Transporter } from 'nodemailer';
import type { Mailer } from './invites';

// Outgoing mail for invite-only sign-up, through an SMTP server named in the
// server's environment. Kalponik uses a Gmail account with an app password
// (docs/DEPLOY.md, "Email"); any SMTP server works.
//
//   KALPONIK_SMTP_USER  the account to send from (required to send anything)
//   KALPONIK_SMTP_PASS  its password (for Gmail: an app password)
//   KALPONIK_SMTP_HOST  default smtp.gmail.com
//   KALPONIK_SMTP_PORT  default 465 (TLS from the start; 587 uses STARTTLS)
//   KALPONIK_MAIL_FROM  default "Kalponik <KALPONIK_SMTP_USER>"
//
// With no user or password, mail is off: nothing is sent and invites.ts
// skips email verification.

export const isMailConfigured = () =>
  !!process.env['KALPONIK_SMTP_USER'] && !!process.env['KALPONIK_SMTP_PASS'];

let transport: Transporter | null = null;

const getTransport = () => {
  if (!transport) {
    const port = Number(process.env['KALPONIK_SMTP_PORT'] || 465);
    transport = nodemailer.createTransport({
      host: process.env['KALPONIK_SMTP_HOST'] || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: {
        user: process.env['KALPONIK_SMTP_USER'],
        pass: process.env['KALPONIK_SMTP_PASS'],
      },
    });
  }
  return transport;
};

export const createSmtpMailer = (): Mailer => {
  const enabled = isMailConfigured();
  return {
    enabled,
    async send({ to, subject, text }) {
      if (!enabled) return false;
      const user = process.env['KALPONIK_SMTP_USER'];
      await getTransport().sendMail({
        from: process.env['KALPONIK_MAIL_FROM'] || `Kalponik <${user}>`,
        to,
        subject,
        text,
      });
      return true;
    },
  };
};

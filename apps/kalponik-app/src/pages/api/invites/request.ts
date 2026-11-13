import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { hashIp, requestAccess } from '@/libs/invites';
import { createInviteDeps, getClientIp } from '@/libs/invitesStore';

// POST { email, password, note?, website? } -> { code, verificationSent }
// Asks for access. Creates the account, locked, with the chosen password, and
// emails a verification link. The code is the requester's key to their
// status page; the account unlocks once the email is verified and an admin
// approves the request.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, note, website } = req.body ?? {};
  try {
    const result = await requestAccess(
      createInviteDeps(),
      {
        email: typeof email === 'string' ? email : '',
        password: typeof password === 'string' ? password : '',
        note: typeof note === 'string' ? note : null,
        website: typeof website === 'string' ? website : '',
        ipHash: hashIp(getClientIp(req)),
      },
      new Date(),
    );
    if (!result.ok) {
      const status =
        result.error === 'rate_limited' || result.error === 'too_many_pending'
          ? 429
          : result.error === 'create_failed'
            ? 500
            : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ code: result.code, verificationSent: result.verificationSent });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

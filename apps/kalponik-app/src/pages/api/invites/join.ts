import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { joinWithInvite } from '@/libs/invites';
import { createInviteDeps } from '@/libs/invitesStore';

// POST { code, email, password } -> { email, active }
// Uses an approved invite (a link, or a request approved before accounts
// were created up front) to create the account, once. It stays locked until
// the email is verified; `active` says whether it is unlocked already (it is
// when no mail server is configured).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, email, password } = req.body ?? {};
  try {
    const result = await joinWithInvite(
      createInviteDeps(),
      {
        code: typeof code === 'string' ? code : '',
        email: typeof email === 'string' ? email : '',
        password: typeof password === 'string' ? password : '',
      },
      new Date(),
    );
    if (!result.ok) {
      const status =
        result.error === 'invalid_code' ? 404 : result.error === 'create_failed' ? 500 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ email: result.email, active: result.active });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

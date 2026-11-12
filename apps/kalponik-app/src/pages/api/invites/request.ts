import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { hashIp, requestAccess } from '@/libs/invites';
import { createSupabaseInviteStore, getClientIp } from '@/libs/invitesStore';

// POST { email, note?, website? } -> { code }
// Leaves an access request for the admin. Creates no account; the code is the
// requester's key to their status page, which becomes the join page once the
// request is approved.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, note, website } = req.body ?? {};
  try {
    const result = await requestAccess(
      createSupabaseInviteStore(),
      {
        email: typeof email === 'string' ? email : '',
        note: typeof note === 'string' ? note : null,
        website: typeof website === 'string' ? website : '',
        ipHash: hashIp(getClientIp(req)),
      },
      new Date(),
    );
    if (!result.ok) {
      const status =
        result.error === 'rate_limited' || result.error === 'too_many_pending' ? 429 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ code: result.code });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

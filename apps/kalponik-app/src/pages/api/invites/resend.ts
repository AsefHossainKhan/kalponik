import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { resendVerification } from '@/libs/invites';
import { createInviteDeps } from '@/libs/invitesStore';

// POST { code } -> { ok }
// "Send the email again" on the status page: a new verification link (the
// old one stops working), at most once a minute.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code } = req.body ?? {};
  try {
    const result = await resendVerification(
      createInviteDeps(),
      typeof code === 'string' ? code : '',
      new Date(),
    );
    if (!result.ok) {
      const status =
        result.error === 'invalid_code' ? 404 : result.error === 'too_soon' ? 429 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

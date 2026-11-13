import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { verifyEmail } from '@/libs/invites';
import { createInviteDeps } from '@/libs/invitesStore';

// POST { token } -> { email, approved, active }
// The link in the verification email. Marks the email verified, and unlocks
// the account if its invite is approved already.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body ?? {};
  try {
    const result = await verifyEmail(
      createInviteDeps(),
      typeof token === 'string' ? token : '',
      new Date(),
    );
    if (!result.ok) {
      return res.status(result.error === 'invalid_code' ? 404 : 400).json({ error: result.error });
    }
    const { ok: _ok, ...body } = result;
    return res.status(200).json(body);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

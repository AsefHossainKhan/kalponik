import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { getInviteStatus } from '@/libs/invites';
import { createSupabaseInviteStore } from '@/libs/invitesStore';
import { isMailConfigured } from '@/libs/mailer';

// GET ?code=... -> { kind, state, email, expiresAt, account, mail }
// What the join page shows: whether this invite can be used yet, and how far
// along its account is (email verified, approved, unlocked). `mail` says
// whether the server sends email at all.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const code = typeof req.query['code'] === 'string' ? req.query['code'] : '';
  try {
    const result = await getInviteStatus(createSupabaseInviteStore(), code, new Date());
    if (!result.ok) return res.status(404).json({ error: result.error });
    const { ok: _ok, ...status } = result;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ...status, mail: isMailConfigured() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createInviteLink, decideInvite, listInvitesForAdmin } from '@/libs/invites';
import { createInviteDeps, requireAdmin } from '@/libs/invitesStore';

// The admin side of invite-only sign-up. Admins are the root admin(s) named
// in KALPONIK_ADMINS on the server plus admins added on the admin page; the
// server decides, not the app.
//
// GET                                  -> { pending, waiting, active, recent }
// POST { action: 'create', note? }     -> { code }
// POST { action: 'approve' | 'decline' | 'revoke', id } -> { ok }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  let admin;
  try {
    admin = await requireAdmin(req, res);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
  if (!admin) return;

  const deps = createInviteDeps();
  const { store } = deps;
  const now = new Date();
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(await listInvitesForAdmin(store, now));
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, id, note } = req.body ?? {};
    if (action === 'create') {
      const { code } = await createInviteLink(
        store,
        { note: typeof note === 'string' ? note : null },
        now,
      );
      return res.status(200).json({ code });
    }
    if (
      (action === 'approve' || action === 'decline' || action === 'revoke') &&
      typeof id === 'string'
    ) {
      const result = await decideInvite(deps, id, action, now);
      if (!result.ok) return res.status(result.error === 'not_found' ? 404 : 409).json(result);
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'bad_request' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

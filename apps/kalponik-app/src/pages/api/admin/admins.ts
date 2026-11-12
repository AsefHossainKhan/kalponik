import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { addAdmin, listAdmins, removeAdmin } from '@/libs/admins';
import {
  createSupabaseAdminStore,
  createSupabaseUserDirectory,
  getRootAdminsSetting,
  requireAdmin,
} from '@/libs/invitesStore';

// Who else may use the admin page. Root admins (KALPONIK_ADMINS on the server)
// can't be removed here; added admins can, by any admin but themselves.
//
// GET                                   -> { admins: [{ id, email, root, addedAt }], me }
// POST { action: 'add', email }         -> { ok }
// POST { action: 'remove', userId }     -> { ok }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const store = createSupabaseAdminStore();
    const users = createSupabaseUserDirectory();
    const rootAdmins = getRootAdminsSetting();

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res
        .status(200)
        .json({ admins: await listAdmins(store, users, rootAdmins), me: admin.id });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, email, userId } = req.body ?? {};
    if (action === 'add' && typeof email === 'string') {
      const result = await addAdmin(store, users, admin, email, new Date(), rootAdmins);
      return result.ok ? res.status(200).json(result) : res.status(400).json(result);
    }
    if (action === 'remove' && typeof userId === 'string') {
      const result = await removeAdmin(store, users, admin, userId, rootAdmins);
      return result.ok ? res.status(200).json(result) : res.status(400).json(result);
    }
    return res.status(400).json({ error: 'bad_request' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

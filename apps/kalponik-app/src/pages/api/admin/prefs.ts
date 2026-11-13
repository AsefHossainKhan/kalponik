import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { createSupabaseAdminPrefs, requireAdmin } from '@/libs/invitesStore';
import { isMailConfigured } from '@/libs/mailer';

// The signed-in admin's own settings.
//
// GET                         -> { notifyRequests, mail }
// POST { notifyRequests }     -> { notifyRequests, mail }
//
// notifyRequests: email this admin when someone asks for access (off by
// default). `mail` says whether the server can send email at all.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const prefs = createSupabaseAdminPrefs();
    res.setHeader('Cache-Control', 'no-store');

    if (req.method === 'GET') {
      return res.status(200).json({ ...(await prefs.get(admin.id)), mail: isMailConfigured() });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { notifyRequests } = req.body ?? {};
    if (typeof notifyRequests !== 'boolean') return res.status(400).json({ error: 'bad_request' });
    await prefs.set(admin.id, { notifyRequests });
    return res.status(200).json({ notifyRequests, mail: isMailConfigured() });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

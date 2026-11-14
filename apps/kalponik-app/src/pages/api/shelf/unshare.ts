import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { shelfErrorStatus, unshareBook } from '@/libs/publicShelf';
import { createShelfDeps } from '@/libs/publicShelfStore';

// Takes a book off the public shelf: the person who shared it, or an admin.
// The file goes back to the sharer's private storage when they still have it.
//
// POST { bookHash } -> { ok, returnedToSharer } | { ok: false, error }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user } = await validateUserAndToken(req.headers['authorization']);
    if (!user) return res.status(401).json({ error: 'not_authenticated' });

    const { bookHash } = req.body ?? {};
    const deps = createShelfDeps({ id: user.id, email: (user.email as string) ?? null });
    const result = await unshareBook(deps, user.id, bookHash);
    return res.status(result.ok ? 200 : shelfErrorStatus(result.error)).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

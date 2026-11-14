import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { validateUserAndToken } from '@/utils/access';
import { getDownloadSignedUrl } from '@/utils/object';
import { listPublicBooks, sharedCoverKey } from '@/libs/publicShelf';
import { createShelfDeps, createShelfNameLookup } from '@/libs/publicShelfStore';

// The public shelf as the signed-in caller sees it.
//
// GET -> { books: [{ hash, title, author, format, size, metadata, sharedAt,
//                    sharedBy, sharedByMe, canRemove, readers, coverUrl }],
//          isAdmin, fileKeyPrefix }
const COVER_URL_TTL_S = 12 * 60 * 60;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { user } = await validateUserAndToken(req.headers['authorization']);
    if (!user) return res.status(401).json({ error: 'not_authenticated' });

    const deps = createShelfDeps({ id: user.id, email: (user.email as string) ?? null });
    const { books, isAdmin } = await listPublicBooks(deps, user.id, createShelfNameLookup());
    const withCovers = await Promise.all(
      books.map(async ({ hasCover, ...book }) => ({
        ...book,
        coverUrl: hasCover
          ? await getDownloadSignedUrl(sharedCoverKey(book.hash), COVER_URL_TTL_S).catch(() => null)
          : null,
      })),
    );
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ books: withCovers, isAdmin });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

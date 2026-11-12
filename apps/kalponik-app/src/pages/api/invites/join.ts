import type { NextApiRequest, NextApiResponse } from 'next';
import { corsAllMethods, runMiddleware } from '@/utils/cors';
import { joinWithInvite } from '@/libs/invites';
import { createSupabaseAccountCreator, createSupabaseInviteStore } from '@/libs/invitesStore';

// POST { code, email, password? } -> { email }
// Creates the account an approved invite allows, once. With a password the
// visitor signs in with email and password; without one the account waits
// for their Google sign-in, which links to it by the same email.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await runMiddleware(req, res, corsAllMethods);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { code, email, password } = req.body ?? {};
  try {
    const result = await joinWithInvite(
      createSupabaseInviteStore(),
      createSupabaseAccountCreator(),
      {
        code: typeof code === 'string' ? code : '',
        email: typeof email === 'string' ? email : '',
        password: typeof password === 'string' ? password : undefined,
      },
      new Date(),
    );
    if (!result.ok) {
      const status =
        result.error === 'invalid_code' ? 404 : result.error === 'create_failed' ? 500 : 400;
      return res.status(status).json({ error: result.error });
    }
    return res.status(200).json({ email: result.email });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'server_error' });
  }
}

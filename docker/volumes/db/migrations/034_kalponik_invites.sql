-- Migration 034 (Kalponik): invite-only sign-up.
--
-- Supabase sign-up is turned off; the API server creates every account with
-- the service role. An `invites` row is the permission to create one account:
--
--   kind 'link'    an invite link the admin made and shared. Starts approved.
--   kind 'request' someone asked for access on the site. Starts pending; the
--                  admin approves or declines it. Its email is fixed.
--
-- The code in a link (and on a requester's status page) is a random secret;
-- only its SHA-256 is stored. Nothing here is readable or writable by anon or
-- authenticated users: every read and write goes through the API routes with
-- the service role, which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('link', 'request')),
  status text NOT NULL CHECK (status IN ('pending', 'approved', 'declined', 'revoked', 'used')),
  email text,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  decided_at timestamptz,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT invites_request_has_email CHECK (kind <> 'request' OR email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS invites_status_idx ON public.invites (status, created_at DESC);
CREATE INDEX IF NOT EXISTS invites_ip_recent_idx ON public.invites (ip_hash, created_at DESC);

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invites FROM anon, authenticated;

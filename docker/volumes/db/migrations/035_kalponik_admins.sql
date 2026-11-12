-- Migration 035 (Kalponik): admins added from the app.
--
-- Root admins are named in the server's KALPONIK_ADMINS setting and can't
-- be removed from the app. Any admin can add more admins (existing accounts,
-- by email) or remove them; those are the rows here. Like `invites`, only
-- the API server (service role) reads or writes this table.

CREATE TABLE IF NOT EXISTS public.admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  added_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admins FROM anon, authenticated;

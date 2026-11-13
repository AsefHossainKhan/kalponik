-- Migration 036 (Kalponik): the account comes first, locked.
--
-- Until now an approved invite let the visitor create their account later,
-- on the join page. Now the account is created when they ask (an access
-- request) or join (an invite link), with the password they chose, but
-- locked (banned in Supabase Auth). It unlocks once both hold:
--
--   * their email is verified (the link we email them), and
--   * the invite is approved (a request by an admin; a link from the start).
--
-- `invites.used_by` is that account from the moment it exists. The columns
-- below track the verification and the unlock. `status = 'used'` now means
-- "approved, and the account exists"; `activated_at` says it is unlocked.
--
-- `admin_prefs` holds each admin's own settings: for now, whether to get an
-- email when someone asks for access (off by default).

ALTER TABLE public.invites
  ADD COLUMN IF NOT EXISTS verify_hash text UNIQUE,
  ADD COLUMN IF NOT EXISTS verify_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

-- Accounts made before this migration were created unlocked.
UPDATE public.invites
SET email_verified_at = COALESCE(email_verified_at, used_at, now()),
    activated_at = COALESCE(activated_at, used_at, now())
WHERE status = 'used' AND activated_at IS NULL;

CREATE TABLE IF NOT EXISTS public.admin_prefs (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  notify_requests boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_prefs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_prefs FROM anon, authenticated;

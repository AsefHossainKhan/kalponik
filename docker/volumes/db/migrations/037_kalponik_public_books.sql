-- Migration 037 (Kalponik): the public shelf.
--
-- A book is private unless it is on the public shelf. A public book is
-- stored once, at `shared/Kalponik/Books/<hash>/...` in the books bucket,
-- and any signed-in account can read it. Sharing moves the sharer's copy
-- there; taking it off moves it back (or deletes it when the sharer's
-- account is gone).
--
-- Reading a public book adds an ordinary `books` row for the reader with
-- `shelf = 'public'`, so their progress, reading status, highlights and
-- notes stay in their own `books`, `book_configs` and `book_notes` rows,
-- private as before. Those tables keep their RLS unchanged.
--
-- Only the API server (service role) writes `public_books`. Signed-in
-- accounts may read the books that are on the shelf now.

CREATE TABLE IF NOT EXISTS public.public_books (
  book_hash text PRIMARY KEY,
  title text NOT NULL,
  author text,
  format text NOT NULL,
  file_key text NOT NULL UNIQUE,
  cover_key text,
  file_size bigint NOT NULL CHECK (file_size >= 0),
  metadata jsonb,
  shared_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  shared_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_books_shared_at
  ON public.public_books (shared_at DESC) WHERE removed_at IS NULL;

ALTER TABLE public.public_books ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_books FROM anon, authenticated;
GRANT SELECT ON public.public_books TO authenticated;
DROP POLICY IF EXISTS select_public_books ON public.public_books;
CREATE POLICY select_public_books ON public.public_books
  FOR SELECT TO authenticated USING (removed_at IS NULL);

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS shelf text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'books_shelf_check'
  ) THEN
    ALTER TABLE public.books
      ADD CONSTRAINT books_shelf_check CHECK (shelf IS NULL OR shelf = 'public');
  END IF;
END $$;

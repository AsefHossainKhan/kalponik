-- Kalponik: reading sets (per account, platform and kind of book).
-- Only adds the replica kind 'reading_set' to the allowlist; rows use the
-- existing replicas table, its RLS (own rows only) and its merge function.
-- Apply before the web image that accepts the kind goes live; older clients
-- never send it.
ALTER TABLE public.replicas
  DROP CONSTRAINT IF EXISTS replicas_kind_allowlist,
  ADD CONSTRAINT replicas_kind_allowlist
    CHECK (kind IN ('dictionary', 'font', 'texture', 'opds_catalog', 'abs_server', 'settings', 'bookshelf', 'custom_translator', 'translation_prompt', 'custom_tts', 'reading_set')) NOT VALID;

-- The migration runner commits the metadata change above before this scan,
-- allowing normal reads and writes while existing rows are validated.
ALTER TABLE public.replicas VALIDATE CONSTRAINT replicas_kind_allowlist;

-- Create the versioned CMS storage used by the independent official website.
--
-- Rollback: only before production content exists, revoke and drop both RPCs,
-- drop site_preview_tokens, remove site_content_published_version_fk, then drop
-- site_content_versions and site_content_entries. Once content exists, use a
-- forward migration to disable publishing and preserve all content and history.

CREATE TABLE public.site_content_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('article', 'case', 'city')),
  slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_version_id uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (content_type, slug),
  CONSTRAINT site_content_entries_publication_state_check
    CHECK (
      (
        (published_version_id IS NULL AND published_at IS NULL)
        OR
        (published_version_id IS NOT NULL AND published_at IS NOT NULL)
      )
      AND (status <> 'published' OR published_version_id IS NOT NULL)
      AND (status <> 'draft' OR published_version_id IS NULL)
    )
);

CREATE TABLE public.site_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.site_content_entries(id) ON DELETE CASCADE,
  version_no integer NOT NULL CHECK (version_no > 0),
  title text NOT NULL CHECK (btrim(title) <> ''),
  summary text,
  cover_file_id uuid REFERENCES public.platform_file_objects(id) ON DELETE SET NULL,
  content_blocks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(content_blocks) = 'array'),
  seo_title text,
  seo_description text,
  canonical_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, version_no),
  UNIQUE (entry_id, id)
);

ALTER TABLE public.site_content_entries
ADD CONSTRAINT site_content_published_version_fk
FOREIGN KEY (id, published_version_id)
REFERENCES public.site_content_versions(entry_id, id);

CREATE TABLE public.site_preview_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  entry_id uuid NOT NULL,
  version_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT site_preview_tokens_version_fk
    FOREIGN KEY (entry_id, version_id)
    REFERENCES public.site_content_versions(entry_id, id)
    ON DELETE CASCADE,
  CONSTRAINT site_preview_tokens_expires_after_creation_check
    CHECK (expires_at > created_at),
  CONSTRAINT site_preview_tokens_consumed_after_creation_check
    CHECK (consumed_at IS NULL OR consumed_at >= created_at)
);

CREATE INDEX site_content_entries_publication_idx
ON public.site_content_entries(content_type, status, published_at DESC);

CREATE INDEX site_content_versions_history_idx
ON public.site_content_versions(entry_id, version_no DESC);

CREATE INDEX site_preview_tokens_expiration_idx
ON public.site_preview_tokens(expires_at)
WHERE consumed_at IS NULL;

CREATE TRIGGER tr_site_content_entries_updated_at
BEFORE UPDATE ON public.site_content_entries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.site_content_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_preview_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.site_content_entries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_content_versions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.site_preview_tokens FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_content_entries TO service_role;
-- Version rows are immutable through the application role. Entry deletion may
-- still remove its history through the declared FK ON DELETE CASCADE; direct
-- version mutation is not part of the service_role contract.
REVOKE UPDATE, DELETE ON TABLE public.site_content_versions FROM service_role;
GRANT SELECT, INSERT ON TABLE public.site_content_versions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.site_preview_tokens TO service_role;

CREATE OR REPLACE FUNCTION public.publish_site_content(
  p_entry_id uuid,
  p_version_id uuid,
  p_actor_id uuid
)
RETURNS public.site_content_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_entry public.site_content_entries%ROWTYPE;
  v_version_entry_id uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'site content actor is required';
  END IF;

  PERFORM 1
  FROM public.employees
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'site content actor not found';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.site_content_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'site content entry not found';
  END IF;

  SELECT entry_id
  INTO v_version_entry_id
  FROM public.site_content_versions
  WHERE id = p_version_id;

  IF NOT FOUND OR v_version_entry_id IS DISTINCT FROM p_entry_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'site content version does not belong to entry';
  END IF;

  UPDATE public.site_content_entries
  SET
    published_version_id = p_version_id,
    status = 'published',
    published_at = now(),
    updated_at = now()
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_site_content(
  p_entry_id uuid,
  p_version_id uuid,
  p_actor_id uuid
)
RETURNS public.site_content_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_entry public.site_content_entries%ROWTYPE;
  v_version_entry_id uuid;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'site content actor is required';
  END IF;

  PERFORM 1
  FROM public.employees
  WHERE id = p_actor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'site content actor not found';
  END IF;

  SELECT *
  INTO v_entry
  FROM public.site_content_entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'site content entry not found';
  END IF;

  SELECT entry_id
  INTO v_version_entry_id
  FROM public.site_content_versions
  WHERE id = p_version_id;

  IF NOT FOUND OR v_version_entry_id IS DISTINCT FROM p_entry_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'site content version does not belong to entry';
  END IF;

  UPDATE public.site_content_entries
  SET
    published_version_id = p_version_id,
    status = 'published',
    published_at = now(),
    updated_at = now()
  WHERE id = p_entry_id
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_site_content(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_site_content(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.publish_site_content(uuid, uuid, uuid)
TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_site_content(uuid, uuid, uuid)
TO service_role;

COMMENT ON TABLE public.site_content_entries
IS 'Official website content identities and current publication pointers.';
COMMENT ON CONSTRAINT site_content_entries_publication_state_check
ON public.site_content_entries
IS 'Draft entries have no publication pointer; published entries require one; archived entries may retain or omit a complete publication pair.';
COMMENT ON TABLE public.site_content_versions
IS 'Immutable draft and publication history for official website content.';
COMMENT ON TABLE public.site_preview_tokens
IS 'Single-use official website preview token hashes; plaintext tokens are never stored.';
COMMENT ON FUNCTION public.publish_site_content(uuid, uuid, uuid)
IS 'Atomically publishes a version after locking its entry and validating ownership.';
COMMENT ON FUNCTION public.rollback_site_content(uuid, uuid, uuid)
IS 'Atomically restores a prior version after locking its entry and validating ownership.';

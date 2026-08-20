-- Forward rollback procedure:
-- 1. Disable all new public-project profile writes and keep compatibility routes.
-- 2. Confirm that no published client depends on this table.
-- 3. Only then use a forward migration to remove policies (if later added),
--    triggers, indexes, the table, and its validation functions in dependency order.
-- This migration intentionally performs no automatic rollback or data deletion.

BEGIN;

CREATE FUNCTION public.douyin_public_image_urls_are_valid(p_urls text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog, public
AS $$
  SELECT cardinality(p_urls) <= 30
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(p_urls) AS image_url(url)
      WHERE image_url.url IS NULL
        OR image_url.url !~ '^https://[^[:space:]]+$'
    )
    AND cardinality(p_urls) = (
      SELECT count(DISTINCT image_url.url)
      FROM unnest(p_urls) AS image_url(url)
    );
$$;

REVOKE ALL ON FUNCTION public.douyin_public_image_urls_are_valid(text[])
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
ON FUNCTION public.douyin_public_image_urls_are_valid(text[])
TO service_role;

CREATE TABLE public.douyin_project_public_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL
    REFERENCES public.tenants(id) ON DELETE RESTRICT,
  project_id uuid NOT NULL,
  public_title text NOT NULL,
  public_description text NOT NULL,
  public_image_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  style_tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  budget_band text NULL,
  publication_status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT douyin_project_public_profiles_project_tenant_fkey
    FOREIGN KEY (project_id, tenant_id)
    REFERENCES public.projects(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT douyin_project_public_profiles_public_title_check
    CHECK (btrim(public_title) <> ''),
  CONSTRAINT douyin_project_public_profiles_public_description_check
    CHECK (btrim(public_description) <> ''),
  CONSTRAINT douyin_project_public_profiles_budget_band_check
    CHECK (budget_band IS NULL OR btrim(budget_band) <> ''),
  CONSTRAINT douyin_project_public_profiles_public_image_urls_check
    CHECK (public.douyin_public_image_urls_are_valid(public_image_urls)),
  CONSTRAINT douyin_project_public_profiles_publication_status_check
    CHECK (publication_status IN ('draft', 'published', 'hidden')),
  UNIQUE (tenant_id, project_id)
);

CREATE INDEX douyin_project_public_profiles_tenant_status_updated_idx
ON public.douyin_project_public_profiles(
  tenant_id,
  publication_status,
  updated_at DESC
);

-- The UNIQUE (tenant_id, project_id) constraint above creates the exact index
-- required for tenant-scoped project lookups; a second index would be redundant.

CREATE FUNCTION public.validate_douyin_project_public_profile_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_project_tenant_id uuid;
BEGIN
  SELECT project.tenant_id
  INTO v_project_tenant_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'DOUYIN_PUBLIC_PROJECT_PROFILE_PROJECT_NOT_FOUND';
  END IF;

  IF v_project_tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'DOUYIN_PUBLIC_PROJECT_PROFILE_PROJECT_TENANT_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_douyin_project_public_profile_tenant()
FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER douyin_project_public_profiles_validate_tenant
BEFORE INSERT OR UPDATE OF tenant_id, project_id
ON public.douyin_project_public_profiles
FOR EACH ROW
EXECUTE FUNCTION public.validate_douyin_project_public_profile_tenant();

CREATE TRIGGER tr_douyin_project_public_profiles_updated_at
BEFORE UPDATE ON public.douyin_project_public_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_project_public_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_project_public_profiles
FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.douyin_project_public_profiles
TO service_role;

COMMIT;

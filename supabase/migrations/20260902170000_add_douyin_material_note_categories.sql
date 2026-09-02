BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Forward-only rollback procedure:
-- 1. Deploy callers that stop writing category_id and only use the legacy
--    category text field.
-- 2. In a reviewed forward migration, drop the RPC overloads added here and
--    recreate the previous create/append RPC signatures.
-- 3. Drop the version category foreign key, category_id snapshot columns and
--    douyin_material_note_categories table only after confirming no active
--    versions depend on structured categories.

CREATE TABLE public.douyin_material_note_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NULL,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz NULL,
  UNIQUE (id, tenant_id),
  CONSTRAINT douyin_material_note_categories_created_by_tenant_fkey
    FOREIGN KEY (created_by, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_categories_updated_by_tenant_fkey
    FOREIGN KEY (updated_by, tenant_id)
    REFERENCES public.employees(id, tenant_id) ON DELETE RESTRICT,
  CONSTRAINT douyin_material_note_categories_name_check
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  CONSTRAINT douyin_material_note_categories_description_check
    CHECK (description IS NULL OR char_length(btrim(description)) BETWEEN 1 AND 300),
  CONSTRAINT douyin_material_note_categories_status_check
    CHECK (status IN ('active', 'disabled')),
  CONSTRAINT douyin_material_note_categories_sort_order_check
    CHECK (sort_order BETWEEN 0 AND 100000)
);

CREATE UNIQUE INDEX douyin_material_note_categories_tenant_name_active_uidx
ON public.douyin_material_note_categories(tenant_id, name)
WHERE deleted_at IS NULL;

CREATE INDEX douyin_material_note_categories_list_idx
ON public.douyin_material_note_categories(
  tenant_id, sort_order ASC, updated_at DESC, id DESC
)
WHERE deleted_at IS NULL;

CREATE INDEX douyin_material_note_categories_status_list_idx
ON public.douyin_material_note_categories(
  tenant_id, status, sort_order ASC, updated_at DESC, id DESC
)
WHERE deleted_at IS NULL;

CREATE INDEX douyin_material_note_categories_name_trgm_idx
ON public.douyin_material_note_categories USING GIN (name extensions.gin_trgm_ops);

CREATE INDEX douyin_material_note_categories_description_trgm_idx
ON public.douyin_material_note_categories USING GIN (description extensions.gin_trgm_ops)
WHERE description IS NOT NULL;

CREATE TRIGGER tr_douyin_material_note_categories_updated_at
BEFORE UPDATE ON public.douyin_material_note_categories
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.douyin_material_note_versions
ADD COLUMN category_id uuid NULL,
ADD COLUMN category_name_snapshot text NULL;

INSERT INTO public.douyin_material_note_categories (
  tenant_id, name, status, sort_order, created_by, updated_by, created_at, updated_at
)
SELECT
  source.tenant_id,
  source.name,
  'active',
  0,
  source.actor_employee_id,
  source.actor_employee_id,
  source.first_created_at,
  source.last_created_at
FROM (
  SELECT
    version.tenant_id,
    btrim(version.category) AS name,
    (min(version.created_by::text))::uuid AS actor_employee_id,
    min(version.created_at) AS first_created_at,
    max(version.created_at) AS last_created_at
  FROM public.douyin_material_note_versions AS version
  GROUP BY version.tenant_id, btrim(version.category)
) AS source
ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE SET
  status = 'active',
  updated_by = EXCLUDED.updated_by,
  updated_at = EXCLUDED.updated_at;

ALTER TABLE public.douyin_material_note_versions
DISABLE TRIGGER material_note_version_immutable;

UPDATE public.douyin_material_note_versions AS version
SET
  category_id = category.id,
  category_name_snapshot = category.name
FROM public.douyin_material_note_categories AS category
WHERE category.tenant_id = version.tenant_id
  AND category.name = btrim(version.category)
  AND category.deleted_at IS NULL;

ALTER TABLE public.douyin_material_note_versions
ENABLE TRIGGER material_note_version_immutable;

ALTER TABLE public.douyin_material_note_versions
ADD CONSTRAINT douyin_material_note_versions_category_id_not_null
  CHECK (category_id IS NOT NULL) NOT VALID,
ADD CONSTRAINT douyin_material_note_versions_category_name_snapshot_not_null
  CHECK (category_name_snapshot IS NOT NULL) NOT VALID,
ADD CONSTRAINT douyin_material_note_versions_category_name_snapshot_check
  CHECK (char_length(btrim(category_name_snapshot)) BETWEEN 1 AND 100) NOT VALID,
ADD CONSTRAINT douyin_material_note_versions_category_tenant_fkey
  FOREIGN KEY (category_id, tenant_id)
  REFERENCES public.douyin_material_note_categories(id, tenant_id)
  ON DELETE RESTRICT NOT VALID;

ALTER TABLE public.douyin_material_note_versions
VALIDATE CONSTRAINT douyin_material_note_versions_category_id_not_null;
ALTER TABLE public.douyin_material_note_versions
VALIDATE CONSTRAINT douyin_material_note_versions_category_name_snapshot_not_null;
ALTER TABLE public.douyin_material_note_versions
VALIDATE CONSTRAINT douyin_material_note_versions_category_name_snapshot_check;
ALTER TABLE public.douyin_material_note_versions
VALIDATE CONSTRAINT douyin_material_note_versions_category_tenant_fkey;

ALTER TABLE public.douyin_material_note_versions
ALTER COLUMN category_id SET NOT NULL,
ALTER COLUMN category_name_snapshot SET NOT NULL;

DROP FUNCTION IF EXISTS public.create_douyin_material_note(
  uuid, uuid, text, text, text, text, jsonb
);
DROP FUNCTION IF EXISTS public.append_douyin_material_note_version(
  uuid, uuid, uuid, text, text, text, text, jsonb
);

CREATE OR REPLACE FUNCTION public.create_douyin_material_note(
  p_tenant_id uuid,
  p_actor_employee_id uuid,
  p_title text,
  p_summary text,
  p_category text,
  p_applicable_to text,
  p_content_blocks jsonb,
  p_category_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_note_id uuid;
  v_version_id uuid;
  v_category_id uuid;
  v_category_name text;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_employee_id IS NULL
    OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 300
    OR p_summary IS NULL OR char_length(btrim(p_summary)) NOT BETWEEN 1 AND 1000
    OR p_category IS NULL OR char_length(btrim(p_category)) NOT BETWEEN 1 AND 100
    OR (p_applicable_to IS NOT NULL AND char_length(btrim(p_applicable_to)) NOT BETWEEN 1 AND 300)
    OR NOT public.is_valid_douyin_material_note_content_blocks(p_content_blocks)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;

  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_ACTOR_NOT_ACTIVE';
  END IF;

  IF p_category_id IS NULL THEN
    INSERT INTO public.douyin_material_note_categories (
      tenant_id, name, status, sort_order, created_by, updated_by
    ) VALUES (
      p_tenant_id, btrim(p_category), 'active', 0, p_actor_employee_id, p_actor_employee_id
    )
    ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE SET
      status = 'active',
      updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    RETURNING id, name INTO v_category_id, v_category_name;
  ELSE
    SELECT category.id, category.name INTO v_category_id, v_category_name
    FROM public.douyin_material_note_categories AS category
    WHERE category.id = p_category_id
      AND category.tenant_id = p_tenant_id
      AND category.status = 'active'
      AND category.deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_CATEGORY_NOT_FOUND';
    END IF;
  END IF;

  INSERT INTO public.douyin_material_notes (tenant_id, created_by, updated_by)
  VALUES (p_tenant_id, p_actor_employee_id, p_actor_employee_id)
  RETURNING id INTO v_note_id;
  INSERT INTO public.douyin_material_note_versions (
    tenant_id, note_id, version_no, title, summary, category, category_id,
    category_name_snapshot, applicable_to, content_blocks, created_by
  ) VALUES (
    p_tenant_id, v_note_id, 1, btrim(p_title), btrim(p_summary),
    v_category_name, v_category_id, v_category_name,
    CASE WHEN p_applicable_to IS NULL THEN NULL ELSE btrim(p_applicable_to) END,
    p_content_blocks, p_actor_employee_id
  ) RETURNING id INTO v_version_id;

  RETURN jsonb_build_object('note_id', v_note_id, 'version_id', v_version_id,
    'version_no', 1, 'status', 'draft');
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_douyin_material_note_version(
  p_tenant_id uuid,
  p_note_id uuid,
  p_actor_employee_id uuid,
  p_title text,
  p_summary text,
  p_category text,
  p_applicable_to text,
  p_content_blocks jsonb,
  p_category_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_note public.douyin_material_notes%ROWTYPE;
  v_version_id uuid;
  v_version_no integer;
  v_category_id uuid;
  v_category_name text;
  v_now timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_note_id IS NULL OR p_actor_employee_id IS NULL
    OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 300
    OR p_summary IS NULL OR char_length(btrim(p_summary)) NOT BETWEEN 1 AND 1000
    OR p_category IS NULL OR char_length(btrim(p_category)) NOT BETWEEN 1 AND 100
    OR (p_applicable_to IS NOT NULL AND char_length(btrim(p_applicable_to)) NOT BETWEEN 1 AND 300)
    OR NOT public.is_valid_douyin_material_note_content_blocks(p_content_blocks)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'MATERIAL_NOTE_INVALID_INPUT';
  END IF;
  PERFORM 1 FROM public.tenants AS tenant
  WHERE tenant.id = p_tenant_id AND tenant.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_TENANT_NOT_ACTIVE';
  END IF;
  PERFORM 1 FROM public.employees AS employee
  WHERE employee.id = p_actor_employee_id
    AND employee.tenant_id = p_tenant_id
    AND employee.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_ACTOR_NOT_ACTIVE';
  END IF;

  SELECT note.* INTO v_note
  FROM public.douyin_material_notes AS note
  WHERE note.id = p_note_id AND note.tenant_id = p_tenant_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_NOT_FOUND';
  END IF;
  IF v_note.status = 'withdrawn' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_WITHDRAWN';
  END IF;

  IF p_category_id IS NULL THEN
    INSERT INTO public.douyin_material_note_categories (
      tenant_id, name, status, sort_order, created_by, updated_by
    ) VALUES (
      p_tenant_id, btrim(p_category), 'active', 0, p_actor_employee_id, p_actor_employee_id
    )
    ON CONFLICT (tenant_id, name) WHERE deleted_at IS NULL DO UPDATE SET
      status = 'active',
      updated_by = p_actor_employee_id,
      updated_at = clock_timestamp()
    RETURNING id, name INTO v_category_id, v_category_name;
  ELSE
    SELECT category.id, category.name INTO v_category_id, v_category_name
    FROM public.douyin_material_note_categories AS category
    WHERE category.id = p_category_id
      AND category.tenant_id = p_tenant_id
      AND category.status = 'active'
      AND category.deleted_at IS NULL
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MATERIAL_NOTE_CATEGORY_NOT_FOUND';
    END IF;
  END IF;

  v_now := clock_timestamp();
  SELECT coalesce(max(version.version_no), 0) + 1 INTO v_version_no
  FROM public.douyin_material_note_versions AS version
  WHERE version.note_id = p_note_id;
  INSERT INTO public.douyin_material_note_versions (
    tenant_id, note_id, version_no, title, summary, category, category_id,
    category_name_snapshot, applicable_to, content_blocks, created_by
  ) VALUES (
    p_tenant_id, p_note_id, v_version_no, btrim(p_title), btrim(p_summary),
    v_category_name, v_category_id, v_category_name,
    CASE WHEN p_applicable_to IS NULL THEN NULL ELSE btrim(p_applicable_to) END,
    p_content_blocks, p_actor_employee_id
  ) RETURNING id INTO v_version_id;
  UPDATE public.douyin_material_notes
  SET updated_by = p_actor_employee_id, updated_at = v_now
  WHERE id = p_note_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('note_id', p_note_id, 'version_id', v_version_id,
    'version_no', v_version_no, 'status', v_note.status);
END;
$function$;

ALTER TABLE public.douyin_material_note_categories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.douyin_material_note_categories
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.douyin_material_note_categories
TO service_role;

REVOKE ALL ON FUNCTION public.create_douyin_material_note(
  uuid, uuid, text, text, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.append_douyin_material_note_version(
  uuid, uuid, uuid, text, text, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_douyin_material_note(
  uuid, uuid, text, text, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION public.append_douyin_material_note_version(
  uuid, uuid, uuid, text, text, text, text, jsonb, uuid
) TO service_role;

COMMENT ON TABLE public.douyin_material_note_categories IS
  '抖音资料笔记的租户级分类，供后台新建/编辑资料时选择。';
COMMENT ON COLUMN public.douyin_material_note_versions.category_id IS
  '资料版本创建时锁定的租户级分类 ID。';
COMMENT ON COLUMN public.douyin_material_note_versions.category_name_snapshot IS
  '资料版本创建时锁定的分类名称快照，避免分类后续改名影响历史版本语义。';

COMMIT;

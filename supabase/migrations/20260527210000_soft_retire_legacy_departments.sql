-- Soft-retire legacy department compatibility objects.
-- This migration intentionally keeps backup copies for one release window.

BEGIN;

CREATE TABLE IF NOT EXISTS public._backup_departments_20260527 AS
SELECT *
FROM public.departments;

CREATE TABLE IF NOT EXISTS public._backup_tenant_department_legacy_20260527 AS
SELECT
  id,
  tenant_id,
  code,
  legacy_department_id
FROM public.tenant_departments;

ALTER TABLE public.tenant_departments
  DROP CONSTRAINT IF EXISTS tenant_departments_legacy_department_id_fkey;

DROP INDEX IF EXISTS public.tenant_departments_legacy_department_id_idx;

ALTER TABLE public.tenant_departments
  DROP COLUMN IF EXISTS legacy_department_id;

DO $$
BEGIN
  IF to_regclass('public.departments') IS NOT NULL
    AND to_regclass('public.departments_retired_20260527') IS NULL
  THEN
    ALTER TABLE public.departments RENAME TO departments_retired_20260527;
  END IF;
END;
$$;

COMMENT ON TABLE public.departments_retired_20260527 IS
  'Retired legacy departments table kept temporarily for rollback after 2026-05-27 soft retirement.';

COMMENT ON TABLE public._backup_departments_20260527 IS
  'Rollback backup for legacy departments soft retirement on 2026-05-27.';

COMMENT ON TABLE public._backup_tenant_department_legacy_20260527 IS
  'Rollback backup for tenant_departments.legacy_department_id soft retirement on 2026-05-27.';

COMMIT;


-- Roll back 20260527210000_soft_retire_legacy_departments.sql.
-- Execute manually only if the soft-retirement release exposes a missed dependency.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.departments') IS NULL
    AND to_regclass('public.departments_retired_20260527') IS NOT NULL
  THEN
    ALTER TABLE public.departments_retired_20260527 RENAME TO departments;
  END IF;
END;
$$;

ALTER TABLE public.tenant_departments
  ADD COLUMN IF NOT EXISTS legacy_department_id uuid;

UPDATE public.tenant_departments AS tenant_department
SET legacy_department_id = backup.legacy_department_id
FROM public._backup_tenant_department_legacy_20260527 AS backup
WHERE backup.id = tenant_department.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_departments_legacy_department_id_fkey'
      AND conrelid = 'public.tenant_departments'::regclass
  ) THEN
    ALTER TABLE public.tenant_departments
      ADD CONSTRAINT tenant_departments_legacy_department_id_fkey
      FOREIGN KEY (legacy_department_id)
      REFERENCES public.departments(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS tenant_departments_legacy_department_id_idx
ON public.tenant_departments(legacy_department_id)
WHERE legacy_department_id IS NOT NULL;

COMMIT;


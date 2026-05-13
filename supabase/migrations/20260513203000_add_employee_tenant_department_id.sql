ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS tenant_department_id uuid NULL;

UPDATE public.employees AS employee
SET tenant_department_id = tenant_department.id
FROM public.tenant_departments AS tenant_department
WHERE employee.department_id = tenant_department.legacy_department_id
  AND employee.tenant_id = tenant_department.tenant_id
  AND employee.tenant_department_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'employees_tenant_department_id_fkey'
      AND conrelid = 'public.employees'::regclass
  ) THEN
    ALTER TABLE public.employees
    ADD CONSTRAINT employees_tenant_department_id_fkey
    FOREIGN KEY (tenant_department_id)
    REFERENCES public.tenant_departments(id)
    ON DELETE SET NULL
    NOT VALID;
  END IF;
END $$;

ALTER TABLE public.employees
VALIDATE CONSTRAINT employees_tenant_department_id_fkey;

CREATE INDEX IF NOT EXISTS employees_tenant_department_id_idx
ON public.employees(tenant_department_id);

CREATE INDEX IF NOT EXISTS employees_tenant_tenant_department_id_idx
ON public.employees(tenant_id, tenant_department_id);

COMMENT ON COLUMN public.employees.tenant_department_id IS '租户部门配置 ID，阶段 4 起从 departments.department_id 逐步迁移到 tenant_departments.id';

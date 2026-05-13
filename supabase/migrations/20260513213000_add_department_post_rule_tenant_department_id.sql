ALTER TABLE public.department_post_rules
ADD COLUMN IF NOT EXISTS tenant_department_id uuid NULL;

UPDATE public.department_post_rules AS rule
SET tenant_department_id = tenant_department.id
FROM public.tenant_departments AS tenant_department
WHERE rule.tenant_id = tenant_department.tenant_id
  AND rule.department_code = tenant_department.code
  AND rule.tenant_department_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'department_post_rules_tenant_department_id_fkey'
      AND conrelid = 'public.department_post_rules'::regclass
  ) THEN
    ALTER TABLE public.department_post_rules
    ADD CONSTRAINT department_post_rules_tenant_department_id_fkey
    FOREIGN KEY (tenant_department_id)
    REFERENCES public.tenant_departments(id)
    ON DELETE CASCADE
    NOT VALID;
  END IF;
END $$;

ALTER TABLE public.department_post_rules
VALIDATE CONSTRAINT department_post_rules_tenant_department_id_fkey;

CREATE INDEX IF NOT EXISTS department_post_rules_tenant_department_id_idx
ON public.department_post_rules(tenant_department_id);

CREATE INDEX IF NOT EXISTS department_post_rules_tenant_tenant_department_enabled_sort_idx
ON public.department_post_rules(tenant_id, tenant_department_id, enabled, sort);

CREATE UNIQUE INDEX IF NOT EXISTS department_post_rules_tenant_tenant_department_post_unique
ON public.department_post_rules(tenant_id, tenant_department_id, post_code);

COMMENT ON COLUMN public.department_post_rules.tenant_department_id IS '租户部门配置 ID，部门岗位规则从 department_code 逐步迁移到 tenant_departments.id';

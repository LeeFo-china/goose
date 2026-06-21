ALTER TABLE public.projects
ADD COLUMN IF NOT EXISTS construction_workflow_definition_id uuid NULL;

ALTER TABLE public.projects
DROP CONSTRAINT IF EXISTS projects_construction_workflow_definition_id_fkey;

ALTER TABLE public.projects
ADD CONSTRAINT projects_construction_workflow_definition_id_fkey
FOREIGN KEY (construction_workflow_definition_id)
REFERENCES public.workflow_definitions(id)
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projects_construction_workflow_definition
ON public.projects(tenant_id, construction_workflow_definition_id)
WHERE construction_workflow_definition_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.workflow_definition_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  workflow_purpose text NOT NULL,
  definition_id uuid NOT NULL,
  selectable boolean NOT NULL DEFAULT true,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_definition_bindings_subject_check CHECK (subject_type IN ('project')),
  CONSTRAINT workflow_definition_bindings_purpose_check CHECK (workflow_purpose IN ('construction')),
  CONSTRAINT workflow_definition_bindings_definition_tenant_fkey FOREIGN KEY (definition_id, tenant_id)
    REFERENCES public.workflow_definitions(id, tenant_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_definition_bindings_unique
ON public.workflow_definition_bindings(tenant_id, subject_type, workflow_purpose, definition_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_definition_bindings_one_default
ON public.workflow_definition_bindings(tenant_id, subject_type, workflow_purpose)
WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_workflow_definition_bindings_lookup
ON public.workflow_definition_bindings(tenant_id, subject_type, workflow_purpose, selectable, is_default);

DROP TRIGGER IF EXISTS tr_workflow_definition_bindings_updated_at
ON public.workflow_definition_bindings;

CREATE TRIGGER tr_workflow_definition_bindings_updated_at
BEFORE UPDATE ON public.workflow_definition_bindings
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.workflow_definition_bindings (
  tenant_id,
  subject_type,
  workflow_purpose,
  definition_id,
  selectable,
  is_default
)
SELECT
  definition.tenant_id,
  'project',
  'construction',
  definition.id,
  true,
  true
FROM public.workflow_definitions definition
WHERE definition.workflow_key = 'construction_main'
  AND definition.category = 'construction'
  AND definition.status = 'active'
  AND definition.active_version_id IS NOT NULL
ON CONFLICT (tenant_id, subject_type, workflow_purpose, definition_id)
DO UPDATE SET
  selectable = true,
  is_default = true,
  updated_at = now();

COMMENT ON COLUMN public.projects.construction_workflow_definition_id
IS '项目创建时选择或默认解析出的施工 workflow definition，用于签约完成后启动施工实例。';

COMMENT ON TABLE public.workflow_definition_bindings
IS '租户业务对象与 workflow definition 的绑定配置，用于默认流程和可选流程解析。';

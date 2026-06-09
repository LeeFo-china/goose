CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  workflow_key text NOT NULL,
  name text NOT NULL,
  description text NULL,
  category text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  active_version_id uuid NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_definitions_key_not_blank CHECK (btrim(workflow_key) <> ''),
  CONSTRAINT workflow_definitions_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT workflow_definitions_category_check CHECK (
    category IN ('main', 'sales', 'construction', 'procedure', 'approval', 'acceptance')
  ),
  CONSTRAINT workflow_definitions_status_check CHECK (status IN ('draft', 'active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_key
ON public.workflow_definitions(tenant_id, workflow_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_definitions_id_tenant
ON public.workflow_definitions(id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_tenant_status_category
ON public.workflow_definitions(tenant_id, status, category, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.workflow_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  version_number integer NOT NULL,
  status text NOT NULL DEFAULT 'published',
  snapshot jsonb NOT NULL,
  validation_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_versions_status_check CHECK (status IN ('published', 'deprecated')),
  CONSTRAINT workflow_versions_number_check CHECK (version_number > 0),
  CONSTRAINT workflow_versions_snapshot_object_check CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT workflow_versions_validation_result_object_check CHECK (jsonb_typeof(validation_result) = 'object'),
  CONSTRAINT workflow_versions_definition_tenant_fkey FOREIGN KEY (definition_id, tenant_id)
    REFERENCES public.workflow_definitions(id, tenant_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_versions_definition_number
ON public.workflow_versions(definition_id, version_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_versions_id_definition
ON public.workflow_versions(id, definition_id);

CREATE INDEX IF NOT EXISTS idx_workflow_versions_tenant_definition
ON public.workflow_versions(tenant_id, definition_id, published_at DESC);

ALTER TABLE public.workflow_definitions
DROP CONSTRAINT IF EXISTS workflow_definitions_active_version_id_fkey;

ALTER TABLE public.workflow_definitions
ADD CONSTRAINT workflow_definitions_active_version_id_fkey
FOREIGN KEY (active_version_id, id)
REFERENCES public.workflow_versions(id, definition_id);

CREATE TABLE IF NOT EXISTS public.workflow_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  node_key text NOT NULL,
  node_type text NOT NULL,
  business_kind text NULL,
  title text NOT NULL,
  description text NULL,
  position jsonb NOT NULL DEFAULT '{"x":0,"y":0}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_nodes_key_not_blank CHECK (btrim(node_key) <> ''),
  CONSTRAINT workflow_nodes_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT workflow_nodes_type_check CHECK (
    node_type IN (
      'start',
      'end',
      'business',
      'construction_stage',
      'procedure',
      'approval',
      'confirmation',
      'notification',
      'automation',
      'subflow'
    )
  ),
  CONSTRAINT workflow_nodes_position_object_check CHECK (jsonb_typeof(position) = 'object'),
  CONSTRAINT workflow_nodes_config_object_check CHECK (jsonb_typeof(config) = 'object'),
  CONSTRAINT workflow_nodes_definition_tenant_fkey FOREIGN KEY (definition_id, tenant_id)
    REFERENCES public.workflow_definitions(id, tenant_id)
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_nodes_definition_key
ON public.workflow_nodes(definition_id, node_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_nodes_id_definition
ON public.workflow_nodes(id, definition_id);

CREATE INDEX IF NOT EXISTS idx_workflow_nodes_tenant_definition_sort
ON public.workflow_nodes(tenant_id, definition_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.workflow_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  definition_id uuid NOT NULL,
  source_node_id uuid NOT NULL,
  target_node_id uuid NOT NULL,
  label text NULL,
  condition jsonb NOT NULL DEFAULT '{"operator":"always"}'::jsonb,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_edges_condition_object_check CHECK (jsonb_typeof(condition) = 'object'),
  CONSTRAINT workflow_edges_condition_operator_check CHECK (
    condition->>'operator' IN ('always', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in')
  ),
  CONSTRAINT workflow_edges_no_self_loop CHECK (source_node_id <> target_node_id),
  CONSTRAINT workflow_edges_definition_tenant_fkey FOREIGN KEY (definition_id, tenant_id)
    REFERENCES public.workflow_definitions(id, tenant_id)
    ON DELETE CASCADE,
  CONSTRAINT workflow_edges_source_node_definition_fkey FOREIGN KEY (source_node_id, definition_id)
    REFERENCES public.workflow_nodes(id, definition_id)
    ON DELETE CASCADE,
  CONSTRAINT workflow_edges_target_node_definition_fkey FOREIGN KEY (target_node_id, definition_id)
    REFERENCES public.workflow_nodes(id, definition_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_definition_source_priority
ON public.workflow_edges(definition_id, source_node_id, priority, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_edges_definition_target
ON public.workflow_edges(definition_id, target_node_id);

DROP TRIGGER IF EXISTS tr_workflow_definitions_updated_at ON public.workflow_definitions;
CREATE TRIGGER tr_workflow_definitions_updated_at
BEFORE UPDATE ON public.workflow_definitions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_workflow_nodes_updated_at ON public.workflow_nodes;
CREATE TRIGGER tr_workflow_nodes_updated_at
BEFORE UPDATE ON public.workflow_nodes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS tr_workflow_edges_updated_at ON public.workflow_edges;
CREATE TRIGGER tr_workflow_edges_updated_at
BEFORE UPDATE ON public.workflow_edges
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.workflow_definitions IS '租户流程定义草稿入口';
COMMENT ON TABLE public.workflow_versions IS '流程发布版本不可变快照';
COMMENT ON TABLE public.workflow_nodes IS '流程草稿节点';
COMMENT ON TABLE public.workflow_edges IS '流程草稿连线';

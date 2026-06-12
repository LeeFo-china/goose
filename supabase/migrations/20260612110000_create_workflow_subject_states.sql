CREATE TABLE IF NOT EXISTS public.workflow_subject_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  definition_id uuid NULL REFERENCES public.workflow_definitions(id) ON DELETE SET NULL,
  instance_id uuid NULL REFERENCES public.workflow_instances(id) ON DELETE SET NULL,
  instance_status text NULL,
  current_node_key text NULL,
  current_node_title text NULL,
  current_business_kind text NULL,
  pending_task_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workflow_subject_states_subject_type_check CHECK (
    subject_type IN ('manual', 'customer', 'project', 'expense_request', 'procedure')
  ),
  CONSTRAINT workflow_subject_states_subject_id_not_blank CHECK (btrim(subject_id) <> ''),
  CONSTRAINT workflow_subject_states_instance_status_check CHECK (
    instance_status IS NULL OR instance_status IN ('running', 'completed', 'canceled', 'failed')
  ),
  CONSTRAINT workflow_subject_states_pending_task_count_check CHECK (pending_task_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_subject_states_subject
ON public.workflow_subject_states(tenant_id, subject_type, subject_id);

CREATE INDEX IF NOT EXISTS idx_workflow_subject_states_tenant_type_node
ON public.workflow_subject_states(tenant_id, subject_type, current_node_key, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_subject_states_tenant_type_status
ON public.workflow_subject_states(tenant_id, subject_type, instance_status, updated_at DESC);

DROP TRIGGER IF EXISTS tr_workflow_subject_states_updated_at ON public.workflow_subject_states;
CREATE TRIGGER tr_workflow_subject_states_updated_at
BEFORE UPDATE ON public.workflow_subject_states
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.workflow_subject_states IS 'Workflow subject current state projection for list/detail/mobile reads';
COMMENT ON COLUMN public.workflow_subject_states.subject_type IS 'Workflow subject type';
COMMENT ON COLUMN public.workflow_subject_states.subject_id IS 'Business subject ID stored as text for mixed entity IDs';
COMMENT ON COLUMN public.workflow_subject_states.current_node_key IS 'Current runtime node key projection';
COMMENT ON COLUMN public.workflow_subject_states.pending_task_count IS 'Pending workflow task count for the current subject';

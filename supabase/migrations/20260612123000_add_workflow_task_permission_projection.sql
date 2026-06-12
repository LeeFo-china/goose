ALTER TABLE public.workflow_tasks
ADD COLUMN IF NOT EXISTS assignee_permission_code text NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_tenant_status_permission_updated
ON public.workflow_tasks(tenant_id, status, assignee_permission_code, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_workflow_task_assignee_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_permission_code text;
BEGIN
  IF NEW.assignee_permission_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT NULLIF(btrim(node->'config'->'required_permissions'->>0), '')
  INTO v_permission_code
  FROM public.workflow_versions version,
       jsonb_array_elements(COALESCE(version.snapshot->'nodes', '[]'::jsonb)) AS node
  WHERE version.id = NEW.version_id
    AND version.tenant_id = NEW.tenant_id
    AND version.definition_id = NEW.definition_id
    AND node->>'id' = NEW.node_id::text
  LIMIT 1;

  NEW.assignee_permission_code := v_permission_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_workflow_tasks_assignee_permission ON public.workflow_tasks;
CREATE TRIGGER tr_workflow_tasks_assignee_permission
BEFORE INSERT ON public.workflow_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_workflow_task_assignee_permission();

WITH task_permission AS (
  SELECT
    task.id AS task_id,
    NULLIF(btrim(node->'config'->'required_permissions'->>0), '') AS permission_code
  FROM public.workflow_tasks task
  JOIN public.workflow_versions version
    ON version.id = task.version_id
   AND version.tenant_id = task.tenant_id
   AND version.definition_id = task.definition_id
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(version.snapshot->'nodes', '[]'::jsonb)
  ) AS node
  WHERE task.assignee_permission_code IS NULL
    AND node->>'id' = task.node_id::text
)
UPDATE public.workflow_tasks task
SET assignee_permission_code = task_permission.permission_code
FROM task_permission
WHERE task.id = task_permission.task_id
  AND task_permission.permission_code IS NOT NULL;

COMMENT ON COLUMN public.workflow_tasks.assignee_permission_code
IS 'Permission code projected from workflow node config.required_permissions[0] for task visibility.';

COMMENT ON FUNCTION public.set_workflow_task_assignee_permission()
IS 'Projects the first required permission from the workflow node snapshot into workflow_tasks before insert.';

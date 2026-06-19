CREATE INDEX IF NOT EXISTS idx_workflow_instances_tenant_definition_status_version
ON public.workflow_instances(tenant_id, definition_id, status, version_id);

CREATE OR REPLACE FUNCTION public.get_workflow_version_running_instance_counts(
  p_tenant_id uuid,
  p_definition_id uuid,
  p_version_ids uuid[]
)
RETURNS TABLE(version_id uuid, running_instance_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    instance.version_id,
    count(*)::integer AS running_instance_count
  FROM public.workflow_instances instance
  WHERE instance.tenant_id = p_tenant_id
    AND instance.definition_id = p_definition_id
    AND instance.status = 'running'
    AND instance.version_id = ANY(p_version_ids)
  GROUP BY instance.version_id;
$$;

REVOKE ALL ON FUNCTION public.get_workflow_version_running_instance_counts(uuid, uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_workflow_version_running_instance_counts(uuid, uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.get_workflow_version_running_instance_counts(uuid, uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_workflow_version_running_instance_counts(uuid, uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION public.get_workflow_version_running_instance_counts(uuid, uuid, uuid[])
IS 'Aggregates running workflow instance counts for a paginated set of workflow version ids.';

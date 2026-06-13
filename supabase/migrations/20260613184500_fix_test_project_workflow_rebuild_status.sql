-- Correct the project status guard after rebuilding the designated test
-- project's construction workflow runtime. The active graph starts at
-- construction_start, which should complete from project status "started" to
-- "constructing".
DO $$
DECLARE
  v_tenant_id uuid := '3eebca47-961f-4899-b976-a3d3208d326b'::uuid;
  v_project_id text := '2d710a84-1045-4750-8dfd-51a0f463a4db';
BEGIN
  UPDATE public.projects project
  SET
    status = 'started',
    updated_at = now()
  WHERE project.id = v_project_id::uuid
    AND project.tenant_id = v_tenant_id
    AND project.status = 'designing'
    AND EXISTS (
      SELECT 1
      FROM public.workflow_subject_states state
      WHERE state.tenant_id = v_tenant_id
        AND state.subject_type = 'project'
        AND state.subject_id = v_project_id
        AND state.instance_status = 'running'
        AND state.current_node_key = 'construction_start'
    );
END $$;

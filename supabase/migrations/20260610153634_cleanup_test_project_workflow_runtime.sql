-- Cleanup the manually completed workflow runtime for the designated test project.
-- Project: 2d710a84-1045-4750-8dfd-51a0f463a4db
-- Workflow definition: 2c0e27d5-f296-41de-9653-16c5a4f961d8
-- Child rows in workflow_instance_nodes, workflow_tasks, and workflow_transition_logs
-- are removed by ON DELETE CASCADE.
DELETE FROM public.workflow_instances
WHERE tenant_id = '3eebca47-961f-4899-b976-a3d3208d326b'::uuid
  AND definition_id = '2c0e27d5-f296-41de-9653-16c5a4f961d8'::uuid
  AND subject_type = 'project'
  AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db';

-- Cleanup workflow runtime rows for the designated manual test project.
DELETE FROM public.workflow_tasks
WHERE instance_id IN (
  SELECT id FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
);

DELETE FROM public.workflow_instance_nodes
WHERE instance_id IN (
  SELECT id FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
);

DELETE FROM public.workflow_transition_logs
WHERE instance_id IN (
  SELECT id FROM public.workflow_instances
  WHERE subject_type = 'project'
    AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
);

DELETE FROM public.workflow_instances
WHERE subject_type = 'project'
  AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db';

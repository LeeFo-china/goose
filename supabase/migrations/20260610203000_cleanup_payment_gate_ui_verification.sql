-- Cleanup workflow runtime and payment rows created by payment gate UI verification.
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

DELETE FROM public.payments
WHERE id = '90edbe1d-326f-4bd1-b224-0b5f50de1015'
  AND project_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
  AND type = 'stage_2'
  AND status = 'confirmed';

-- Cleanup runtime data for the manual workflow verification project.
-- Target project: 2d710a84-1045-4750-8dfd-51a0f463a4db
-- Related workflow: 工程施工 / construction_custom_mq7hqqgl_1_d0c5a149

DELETE FROM public.workflow_instances
WHERE subject_type = 'project'
  AND subject_id = '2d710a84-1045-4750-8dfd-51a0f463a4db'
  AND definition_id = '2c0e27d5-f296-41de-9653-16c5a4f961d8';

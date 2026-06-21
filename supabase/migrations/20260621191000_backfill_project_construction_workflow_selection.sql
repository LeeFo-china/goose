UPDATE public.projects project
SET construction_workflow_definition_id = binding.definition_id
FROM public.workflow_definition_bindings binding
WHERE project.tenant_id = binding.tenant_id
  AND binding.subject_type = 'project'
  AND binding.workflow_purpose = 'construction'
  AND binding.selectable = true
  AND binding.is_default = true
  AND project.construction_workflow_definition_id IS NULL;

COMMENT ON COLUMN public.projects.construction_workflow_definition_id
IS '项目创建时选择或默认解析出的施工 workflow definition；历史项目已按当时默认施工流程回填，避免后续默认切换影响已创建项目。';

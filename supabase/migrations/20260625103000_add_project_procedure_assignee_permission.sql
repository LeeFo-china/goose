-- Add a stable marker permission for employees who can be assigned to construction procedures.

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES (
  'project_procedure.assignee',
  '可被安排工序',
  'project_procedure',
  'project_procedure',
  'assignee',
  '员工具备后可出现在工序施工人员候选列表中',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT roles.id, permissions.id, 'self'
FROM public.roles
JOIN public.permissions
  ON permissions.code = 'project_procedure.assignee'
WHERE roles.tenant_id IS NOT NULL
  AND roles.name = '施工人员'
  AND roles.status = 'active'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

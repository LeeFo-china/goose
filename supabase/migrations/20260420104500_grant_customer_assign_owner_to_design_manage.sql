INSERT INTO public.roles (code, name, description, status)
VALUES (
  'design_manage',
  '设计主管',
  '设计主管的部门级客户查看与负责人分配权限模板',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id,
  CASE p.code
    WHEN 'customer.read' THEN 'department'
    WHEN 'customer.assign_owner' THEN 'department'
    ELSE 'department'
  END
FROM public.roles r
JOIN public.permissions p
  ON p.code = ANY (
    ARRAY[
      'customer.read',
      'customer.assign_owner'
    ]
  )
WHERE r.code = 'design_manage'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

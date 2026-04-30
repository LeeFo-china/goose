ALTER TABLE public.permissions
ADD COLUMN IF NOT EXISTS name text;

UPDATE public.permissions AS p
SET name = seed.name
FROM (
  VALUES
    ('dashboard.read', '查看工作台'),
    ('task_center.read', '查看待办中心'),
    ('customer.read', '查看客户'),
    ('customer.create', '新建客户'),
    ('customer.update', '编辑客户'),
    ('customer.assign_owner', '分配客户负责人'),
    ('customer.phone.view', '查看客户完整手机号'),
    ('customer.phone.call', '拨打客户手机号'),
    ('customer.phone.copy', '复制客户手机号'),
    ('project.read', '查看项目'),
    ('project.create', '新建项目'),
    ('project.update', '编辑项目'),
    ('project.delete', '删除项目'),
    ('project_log.create', '新建施工日志'),
    ('employee.read', '查看员工'),
    ('employee.create', '新建员工'),
    ('employee.update', '编辑员工'),
    ('employee.permission_manage', '管理员工权限'),
    ('expense_request.read', '查看费用申请'),
    ('expense_request.create', '新建费用申请'),
    ('expense_request.submit', '提交费用申请'),
    ('expense_request.approve_manager', '主管审批费用申请'),
    ('expense_request.approve_finance', '财务审批费用申请'),
    ('expense_request.pay', '登记费用打款'),
    ('project_referral.read', '查看介绍费'),
    ('project_referral.manage', '管理介绍费')
) AS seed(code, name)
WHERE p.code = seed.code
  AND (p.name IS NULL OR btrim(p.name) = '');

UPDATE public.permissions
SET name = COALESCE(NULLIF(btrim(description), ''), code)
WHERE name IS NULL OR btrim(name) = '';

ALTER TABLE public.permissions
ALTER COLUMN name SET NOT NULL;

ALTER TABLE public.permissions
DROP CONSTRAINT IF EXISTS permissions_name_not_blank;

ALTER TABLE public.permissions
ADD CONSTRAINT permissions_name_not_blank
CHECK (btrim(name) <> '');

COMMENT ON COLUMN public.permissions.name IS '权限展示名称，用于后台权限管理页展示；权限判断仍以 code 为准';

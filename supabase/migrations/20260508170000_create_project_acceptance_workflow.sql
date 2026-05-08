CREATE TABLE IF NOT EXISTS public.project_acceptance_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_code text NOT NULL,
  name text NOT NULL,
  description text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_acceptance_templates
DROP CONSTRAINT IF EXISTS project_acceptance_templates_stage_code_check,
DROP CONSTRAINT IF EXISTS project_acceptance_templates_status_check;

ALTER TABLE public.project_acceptance_templates
ADD CONSTRAINT project_acceptance_templates_stage_code_check
CHECK (
  stage_code IN (
    'measure',
    'demolition',
    'plumbing_electrical',
    'tiling',
    'woodwork',
    'painting',
    'installation',
    'completion'
  )
),
ADD CONSTRAINT project_acceptance_templates_status_check
CHECK (status IN ('active', 'inactive'));

CREATE TABLE IF NOT EXISTS public.project_acceptance_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.project_acceptance_templates(id) ON DELETE CASCADE,
  category text,
  title text NOT NULL,
  standard text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  allow_not_applicable boolean NOT NULL DEFAULT false,
  photo_required boolean NOT NULL DEFAULT false,
  photo_min_count integer NOT NULL DEFAULT 0,
  photo_max_count integer NOT NULL DEFAULT 9,
  input_type text NOT NULL DEFAULT 'pass_fail',
  options jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_acceptance_template_items
DROP CONSTRAINT IF EXISTS project_acceptance_template_items_input_type_check,
DROP CONSTRAINT IF EXISTS project_acceptance_template_items_status_check,
DROP CONSTRAINT IF EXISTS project_acceptance_template_items_photo_count_check;

ALTER TABLE public.project_acceptance_template_items
ADD CONSTRAINT project_acceptance_template_items_input_type_check
CHECK (input_type IN ('pass_fail', 'text', 'number', 'select')),
ADD CONSTRAINT project_acceptance_template_items_status_check
CHECK (status IN ('active', 'inactive')),
ADD CONSTRAINT project_acceptance_template_items_photo_count_check
CHECK (
  photo_min_count >= 0
  AND photo_max_count >= photo_min_count
  AND photo_max_count <= 9
);

CREATE TABLE IF NOT EXISTS public.project_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  template_id uuid REFERENCES public.project_acceptance_templates(id) ON DELETE SET NULL,
  template_version integer NOT NULL DEFAULT 1,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  initiator_id uuid NOT NULL REFERENCES public.employees(id),
  reviewer_id uuid REFERENCES public.employees(id),
  customer_id uuid REFERENCES public.customers(id),
  summary text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  customer_confirmed_at timestamptz,
  completed_at timestamptz,
  rejected_at timestamptz,
  reject_reason text,
  reject_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_acceptances
DROP CONSTRAINT IF EXISTS project_acceptances_stage_code_check,
DROP CONSTRAINT IF EXISTS project_acceptances_status_check,
DROP CONSTRAINT IF EXISTS project_acceptances_reject_source_check;

ALTER TABLE public.project_acceptances
ADD CONSTRAINT project_acceptances_stage_code_check
CHECK (
  stage_code IN (
    'measure',
    'demolition',
    'plumbing_electrical',
    'tiling',
    'woodwork',
    'painting',
    'installation',
    'completion'
  )
),
ADD CONSTRAINT project_acceptances_status_check
CHECK (
  status IN (
    'draft',
    'submitted',
    'leader_approved',
    'customer_confirmed',
    'rejected',
    'cancelled'
  )
),
ADD CONSTRAINT project_acceptances_reject_source_check
CHECK (reject_source IS NULL OR reject_source IN ('leader', 'customer'));

CREATE TABLE IF NOT EXISTS public.project_acceptance_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acceptance_id uuid NOT NULL REFERENCES public.project_acceptances(id) ON DELETE CASCADE,
  template_item_id uuid REFERENCES public.project_acceptance_template_items(id) ON DELETE SET NULL,
  category text,
  title text NOT NULL,
  standard text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  allow_not_applicable boolean NOT NULL DEFAULT false,
  photo_required boolean NOT NULL DEFAULT false,
  photo_min_count integer NOT NULL DEFAULT 0,
  photo_max_count integer NOT NULL DEFAULT 9,
  result text,
  remark text,
  rectification_remark text,
  rectification_images jsonb NOT NULL DEFAULT '[]'::jsonb,
  images jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_acceptance_items
DROP CONSTRAINT IF EXISTS project_acceptance_items_result_check,
DROP CONSTRAINT IF EXISTS project_acceptance_items_photo_count_check;

ALTER TABLE public.project_acceptance_items
ADD CONSTRAINT project_acceptance_items_result_check
CHECK (result IS NULL OR result IN ('pass', 'fail', 'not_applicable')),
ADD CONSTRAINT project_acceptance_items_photo_count_check
CHECK (
  photo_min_count >= 0
  AND photo_max_count >= photo_min_count
  AND photo_max_count <= 9
);

CREATE TABLE IF NOT EXISTS public.project_acceptance_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acceptance_id uuid NOT NULL REFERENCES public.project_acceptances(id) ON DELETE CASCADE,
  operator_type text NOT NULL,
  operator_id uuid,
  action text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_acceptance_actions
DROP CONSTRAINT IF EXISTS project_acceptance_actions_operator_type_check,
DROP CONSTRAINT IF EXISTS project_acceptance_actions_action_check;

ALTER TABLE public.project_acceptance_actions
ADD CONSTRAINT project_acceptance_actions_operator_type_check
CHECK (operator_type IN ('employee', 'customer', 'system')),
ADD CONSTRAINT project_acceptance_actions_action_check
CHECK (
  action IN (
    'create',
    'update',
    'submit',
    'leader_approve',
    'leader_reject',
    'customer_confirm',
    'customer_dispute',
    'cancel'
  )
);

CREATE INDEX IF NOT EXISTS project_acceptance_templates_stage_idx
ON public.project_acceptance_templates(stage_code);

CREATE INDEX IF NOT EXISTS project_acceptance_template_items_template_idx
ON public.project_acceptance_template_items(template_id);

CREATE INDEX IF NOT EXISTS project_acceptances_project_id_idx
ON public.project_acceptances(project_id);

CREATE INDEX IF NOT EXISTS project_acceptances_status_idx
ON public.project_acceptances(status);

CREATE INDEX IF NOT EXISTS project_acceptances_reviewer_id_idx
ON public.project_acceptances(reviewer_id);

CREATE INDEX IF NOT EXISTS project_acceptances_customer_id_idx
ON public.project_acceptances(customer_id);

CREATE INDEX IF NOT EXISTS project_acceptances_project_stage_idx
ON public.project_acceptances(project_id, stage_code);

CREATE UNIQUE INDEX IF NOT EXISTS project_acceptances_one_open_stage_idx
ON public.project_acceptances(project_id, stage_code)
WHERE status IN ('draft', 'submitted', 'leader_approved', 'rejected');

CREATE INDEX IF NOT EXISTS project_acceptance_items_acceptance_idx
ON public.project_acceptance_items(acceptance_id);

CREATE INDEX IF NOT EXISTS project_acceptance_actions_acceptance_idx
ON public.project_acceptance_actions(acceptance_id);

DROP TRIGGER IF EXISTS tr_project_acceptance_templates_updated_at ON public.project_acceptance_templates;
CREATE TRIGGER tr_project_acceptance_templates_updated_at
  BEFORE UPDATE ON public.project_acceptance_templates
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS tr_project_acceptance_template_items_updated_at ON public.project_acceptance_template_items;
CREATE TRIGGER tr_project_acceptance_template_items_updated_at
  BEFORE UPDATE ON public.project_acceptance_template_items
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS tr_project_acceptances_updated_at ON public.project_acceptances;
CREATE TRIGGER tr_project_acceptances_updated_at
  BEFORE UPDATE ON public.project_acceptances
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS tr_project_acceptance_items_updated_at ON public.project_acceptance_items;
CREATE TRIGGER tr_project_acceptance_items_updated_at
  BEFORE UPDATE ON public.project_acceptance_items
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

COMMENT ON TABLE public.project_acceptance_templates IS '项目工序验收模板';
COMMENT ON TABLE public.project_acceptance_template_items IS '项目工序验收模板标准项';
COMMENT ON TABLE public.project_acceptances IS '项目工序验收单';
COMMENT ON TABLE public.project_acceptance_items IS '项目工序验收单明细项';
COMMENT ON TABLE public.project_acceptance_actions IS '项目工序验收操作记录';

INSERT INTO public.permissions (code, name, module, resource, action, description, status)
VALUES
  ('project_acceptance.read', '查看项目验收', 'project_acceptance', 'project_acceptance', 'read', '查看项目验收', 'active'),
  ('project_acceptance.create', '发起项目验收', 'project_acceptance', 'project_acceptance', 'create', '发起项目验收', 'active'),
  ('project_acceptance.update_own', '编辑自己发起的项目验收', 'project_acceptance', 'project_acceptance', 'update_own', '编辑自己发起的项目验收', 'active'),
  ('project_acceptance.submit', '提交项目验收', 'project_acceptance', 'project_acceptance', 'submit', '提交项目验收', 'active'),
  ('project_acceptance.review', '复核项目验收', 'project_acceptance', 'project_acceptance', 'review', '复核项目验收', 'active'),
  ('project_acceptance.reject', '驳回项目验收', 'project_acceptance', 'project_acceptance', 'reject', '驳回项目验收', 'active'),
  ('project_acceptance.manage', '管理项目验收', 'project_acceptance', 'project_acceptance', 'manage', '管理项目验收', 'active')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  module = EXCLUDED.module,
  resource = EXCLUDED.resource,
  action = EXCLUDED.action,
  description = EXCLUDED.description,
  status = EXCLUDED.status;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'all'
FROM public.roles r
JOIN public.permissions p
  ON p.code LIKE 'project_acceptance.%'
WHERE r.code = 'system_admin'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

INSERT INTO public.role_permissions (role_id, permission_id, access_scope)
SELECT r.id, p.id, 'self'
FROM public.roles r
JOIN public.permissions p
  ON p.code IN (
    'project_acceptance.read',
    'project_acceptance.create',
    'project_acceptance.update_own',
    'project_acceptance.submit',
    'project_acceptance.review',
    'project_acceptance.reject'
  )
WHERE r.code = 'employee_base'
ON CONFLICT (role_id, permission_id) DO UPDATE SET
  access_scope = EXCLUDED.access_scope;

WITH template_seed(stage_code, name, description, sort_order) AS (
  VALUES
    ('measure', '量房复核', '确认原始房屋信息、尺寸和关键点位', 10),
    ('demolition', '拆改验收', '确认拆改范围、安全保护和现场清运', 20),
    ('plumbing_electrical', '水电验收', '确认水电管线、材料、测试和关键照片归档', 30),
    ('tiling', '瓦工验收', '确认墙地砖铺贴、坡度、空鼓和观感', 40),
    ('woodwork', '木工验收', '确认基层、尺寸、结构和收口', 50),
    ('painting', '油工验收', '确认墙面基层、平整度、阴阳角和观感', 60),
    ('installation', '安装验收', '确认开关、洁具、五金、柜门和灯具安装', 70),
    ('completion', '竣工验收', '确认全屋功能、观感、保洁和交付资料', 80)
)
INSERT INTO public.project_acceptance_templates (
  stage_code,
  name,
  description,
  sort_order,
  status
)
SELECT stage_code, name, description, sort_order, 'active'
FROM template_seed
ON CONFLICT DO NOTHING;

WITH item_seed(stage_code, category, title, standard, photo_required, sort_order) AS (
  VALUES
    ('measure', '现场', '原始结构复核', '房屋原始结构、门窗洞口和重点尺寸已复核', true, 10),
    ('measure', '现场', '强弱电箱位置', '强弱电箱、上下水、燃气等关键点位已记录', true, 20),
    ('demolition', '安全', '拆除范围', '拆除范围与确认方案一致，无违规拆改', true, 10),
    ('demolition', '现场', '成品保护和清运', '现场保护到位，拆除垃圾已按要求清运', true, 20),
    ('plumbing_electrical', '安全', '强弱电间距', '强弱电管线保持合理间距，交叉处有保护处理', true, 10),
    ('plumbing_electrical', '工艺', '线管固定', '管线固定牢靠，转弯顺畅，无明显破损', true, 20),
    ('plumbing_electrical', '工艺', '水管打压', '打压测试结果正常，无渗漏', true, 30),
    ('plumbing_electrical', '材料', '材料品牌规格', '材料品牌规格与合同或确认单一致', false, 40),
    ('tiling', '工艺', '瓷砖空鼓', '空鼓范围符合公司验收标准', true, 10),
    ('tiling', '工艺', '墙地砖平整度', '表面平整，无明显高低差', true, 20),
    ('tiling', '工艺', '卫生间坡度', '地漏排水方向正确，无明显积水', true, 30),
    ('woodwork', '结构', '基层牢固', '基层固定牢靠，结构稳定', true, 10),
    ('woodwork', '工艺', '尺寸和收口', '尺寸偏差、收口和边角处理符合要求', true, 20),
    ('painting', '基层', '墙面平整', '墙面基层处理到位，平整度符合要求', true, 10),
    ('painting', '观感', '裂缝和色差', '无明显裂缝、色差和污染', true, 20),
    ('installation', '功能', '开关插座和灯具', '开关插座、灯具安装牢固且功能正常', true, 10),
    ('installation', '功能', '洁具五金柜门', '洁具、五金、柜门安装牢固且开合正常', true, 20),
    ('completion', '功能', '全屋功能复核', '水电、门窗、柜体、洁具等功能正常', true, 10),
    ('completion', '交付', '保洁和资料', '现场保洁完成，交付资料和遗留问题记录清楚', true, 20)
)
INSERT INTO public.project_acceptance_template_items (
  template_id,
  category,
  title,
  standard,
  required,
  allow_not_applicable,
  photo_required,
  photo_min_count,
  photo_max_count,
  input_type,
  sort_order,
  status
)
SELECT
  t.id,
  s.category,
  s.title,
  s.standard,
  true,
  false,
  s.photo_required,
  CASE WHEN s.photo_required THEN 1 ELSE 0 END,
  9,
  'pass_fail',
  s.sort_order,
  'active'
FROM item_seed s
JOIN public.project_acceptance_templates t
  ON t.stage_code = s.stage_code
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_acceptance_template_items existing
  WHERE existing.template_id = t.id
    AND existing.title = s.title
);

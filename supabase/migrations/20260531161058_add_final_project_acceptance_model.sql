ALTER TABLE public.project_acceptance_templates
ADD COLUMN IF NOT EXISTS acceptance_type text NOT NULL DEFAULT 'stage',
ADD COLUMN IF NOT EXISTS project_type text,
ADD COLUMN IF NOT EXISTS is_builtin boolean NOT NULL DEFAULT false;

ALTER TABLE public.project_acceptance_templates
DROP CONSTRAINT IF EXISTS project_acceptance_templates_acceptance_type_check;

ALTER TABLE public.project_acceptance_templates
ADD CONSTRAINT project_acceptance_templates_acceptance_type_check
CHECK (acceptance_type IN ('stage', 'final'));

CREATE TABLE IF NOT EXISTS public.project_acceptance_template_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.project_acceptance_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.project_acceptance_template_sections
DROP CONSTRAINT IF EXISTS project_acceptance_template_sections_status_check;

ALTER TABLE public.project_acceptance_template_sections
ADD CONSTRAINT project_acceptance_template_sections_status_check
CHECK (status IN ('active', 'inactive'));

ALTER TABLE public.project_acceptance_template_items
ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.project_acceptance_template_sections(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS remark_required_on_fail boolean NOT NULL DEFAULT true;

ALTER TABLE public.project_acceptances
ADD COLUMN IF NOT EXISTS acceptance_type text NOT NULL DEFAULT 'stage',
ADD COLUMN IF NOT EXISTS template_snapshot jsonb;

ALTER TABLE public.project_acceptances
DROP CONSTRAINT IF EXISTS project_acceptances_acceptance_type_check;

ALTER TABLE public.project_acceptances
ADD CONSTRAINT project_acceptances_acceptance_type_check
CHECK (acceptance_type IN ('stage', 'final'));

ALTER TABLE public.project_acceptance_items
ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.project_acceptance_template_sections(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS remark_required_on_fail boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS project_acceptance_templates_type_stage_idx
ON public.project_acceptance_templates(acceptance_type, stage_code, status, sort_order);

CREATE INDEX IF NOT EXISTS project_acceptance_template_sections_template_idx
ON public.project_acceptance_template_sections(template_id, status, sort_order);

CREATE INDEX IF NOT EXISTS project_acceptance_template_items_section_idx
ON public.project_acceptance_template_items(section_id, status, sort_order);

CREATE INDEX IF NOT EXISTS project_acceptances_project_type_status_idx
ON public.project_acceptances(project_id, acceptance_type, status);

CREATE UNIQUE INDEX IF NOT EXISTS project_acceptances_one_open_final_idx
ON public.project_acceptances(project_id, acceptance_type)
WHERE acceptance_type = 'final'
  AND status IN ('draft', 'submitted', 'leader_approved', 'rejected');

DROP TRIGGER IF EXISTS tr_project_acceptance_template_sections_updated_at
ON public.project_acceptance_template_sections;

CREATE TRIGGER tr_project_acceptance_template_sections_updated_at
  BEFORE UPDATE ON public.project_acceptance_template_sections
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

COMMENT ON COLUMN public.project_acceptance_templates.acceptance_type IS '验收类型：stage=普通工序验收，final=竣工交付验收';
COMMENT ON COLUMN public.project_acceptance_templates.project_type IS '适用项目类型，空值表示通用';
COMMENT ON COLUMN public.project_acceptance_templates.is_builtin IS '是否系统内置模板';
COMMENT ON TABLE public.project_acceptance_template_sections IS '项目验收模板分组';
COMMENT ON COLUMN public.project_acceptance_template_items.section_id IS '所属模板分组';
COMMENT ON COLUMN public.project_acceptance_template_items.remark_required_on_fail IS '验收不通过时是否必须填写备注';
COMMENT ON COLUMN public.project_acceptances.acceptance_type IS '验收类型：stage=普通工序验收，final=竣工交付验收';
COMMENT ON COLUMN public.project_acceptances.template_snapshot IS '验收单创建时固化的模板快照';
COMMENT ON COLUMN public.project_acceptance_items.section_id IS '所属模板分组快照';
COMMENT ON COLUMN public.project_acceptance_items.remark_required_on_fail IS '验收不通过时是否必须填写备注';

UPDATE public.project_acceptance_templates
SET acceptance_type = 'stage'
WHERE acceptance_type IS NULL;

UPDATE public.project_acceptances
SET acceptance_type = 'stage'
WHERE acceptance_type IS NULL;

INSERT INTO public.project_acceptance_templates (
  stage_code,
  name,
  description,
  version,
  status,
  sort_order,
  acceptance_type,
  is_builtin
)
SELECT
  'completion',
  '标准竣工交付验收模板',
  '面向项目最终交付的竣工验收模板，覆盖空间、系统、设备、资料等检查项',
  1,
  'active',
  900,
  'final',
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_acceptance_templates
  WHERE acceptance_type = 'final'
    AND stage_code = 'completion'
    AND name = '标准竣工交付验收模板'
);

WITH final_template AS (
  SELECT id
  FROM public.project_acceptance_templates
  WHERE acceptance_type = 'final'
    AND stage_code = 'completion'
    AND name = '标准竣工交付验收模板'
  ORDER BY version DESC, created_at ASC
  LIMIT 1
),
section_seed(title, description, sort_order) AS (
  VALUES
    ('墙顶地', '墙面、顶面、地面观感和基础质量检查', 10),
    ('门窗五金', '门窗、锁具、五金安装与使用检查', 20),
    ('水电设备', '开关插座、灯具、给排水和设备功能检查', 30),
    ('厨卫空间', '厨卫防水收口、洁具和排水检查', 40),
    ('木作收口', '柜体、木作、板材和收口检查', 50),
    ('交付资料', '质保、设备资料、竣工照片和交付清单检查', 60)
)
INSERT INTO public.project_acceptance_template_sections (
  template_id,
  title,
  description,
  sort_order,
  status
)
SELECT
  final_template.id,
  section_seed.title,
  section_seed.description,
  section_seed.sort_order,
  'active'
FROM final_template
CROSS JOIN section_seed
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_acceptance_template_sections existing
  WHERE existing.template_id = final_template.id
    AND existing.title = section_seed.title
);

WITH final_template AS (
  SELECT id
  FROM public.project_acceptance_templates
  WHERE acceptance_type = 'final'
    AND stage_code = 'completion'
    AND name = '标准竣工交付验收模板'
  ORDER BY version DESC, created_at ASC
  LIMIT 1
),
item_seed(section_title, title, standard, required, allow_not_applicable, photo_required, photo_min_count, photo_max_count, remark_required_on_fail, sort_order) AS (
  VALUES
    ('墙顶地', '墙面无明显开裂、空鼓、色差', '肉眼观察无明显瑕疵，阴阳角顺直，墙面无明显开裂、空鼓和污染', true, false, false, 0, 9, true, 10),
    ('墙顶地', '顶面平整无明显裂缝', '顶面平整，乳胶漆或饰面完成效果一致，无明显裂缝和波浪', true, false, false, 0, 9, true, 20),
    ('墙顶地', '地面铺贴或找平质量合格', '地砖、地板或找平层平整牢固，无明显高低差、空鼓和破损', true, false, true, 1, 9, true, 30),
    ('门窗五金', '门窗开合顺畅', '门窗开关顺畅，密封良好，无明显变形、异响和剐蹭', true, false, false, 0, 9, true, 10),
    ('门窗五金', '锁具安装牢固可用', '锁具、合页、拉手安装牢固，开启和锁闭功能正常', true, false, false, 0, 9, true, 20),
    ('门窗五金', '五金无松动和明显损伤', '五金件安装位置正确，无松动、锈蚀、破损和明显划痕', true, true, false, 0, 9, true, 30),
    ('水电设备', '开关插座可用', '开关控制正确，插座通电正常，面板安装平整牢固', true, false, true, 1, 9, true, 10),
    ('水电设备', '灯具和电器点位可用', '灯具安装牢固，照明正常，预留电器点位满足交付要求', true, false, false, 0, 9, true, 20),
    ('水电设备', '给排水无渗漏', '水路通水正常，接口、角阀、下水无渗漏和堵塞', true, false, true, 1, 9, true, 30),
    ('厨卫空间', '防水收口检查合格', '厨卫墙地面、防水收口和门槛石等关键位置处理到位', true, false, true, 1, 9, true, 10),
    ('厨卫空间', '洁具安装牢固可用', '马桶、台盆、花洒、龙头等洁具安装牢固，使用正常', true, false, true, 1, 9, true, 20),
    ('厨卫空间', '地漏排水顺畅', '地漏排水顺畅，无明显积水、返味和堵塞', true, false, true, 1, 9, true, 30),
    ('木作收口', '柜体开合顺畅', '柜门、抽屉开合顺畅，缝隙均匀，无明显异响和干涉', true, true, false, 0, 9, true, 10),
    ('木作收口', '木作收口平整', '踢脚线、门套、柜体收边等收口平整顺直，无明显缝隙', true, true, false, 0, 9, true, 20),
    ('木作收口', '板材无明显破损', '柜体、门板、台面等表面无明显破损、鼓包和污染', true, true, true, 1, 9, true, 30),
    ('交付资料', '质保说明齐全', '质保范围、期限、联系方式和售后流程已向客户说明', true, false, false, 0, 9, true, 10),
    ('交付资料', '设备资料齐全', '设备说明书、保修卡、遥控器、钥匙等交付资料齐全', true, true, false, 0, 9, true, 20),
    ('交付资料', '竣工照片或交付清单已归档', '竣工现场照片、交付清单和遗留问题记录已完成归档', true, false, true, 1, 9, true, 30)
)
INSERT INTO public.project_acceptance_template_items (
  template_id,
  section_id,
  category,
  title,
  standard,
  required,
  allow_not_applicable,
  photo_required,
  photo_min_count,
  photo_max_count,
  input_type,
  options,
  sort_order,
  status,
  remark_required_on_fail
)
SELECT
  final_template.id,
  section.id,
  item_seed.section_title,
  item_seed.title,
  item_seed.standard,
  item_seed.required,
  item_seed.allow_not_applicable,
  item_seed.photo_required,
  item_seed.photo_min_count,
  item_seed.photo_max_count,
  'pass_fail',
  NULL,
  item_seed.sort_order,
  'active',
  item_seed.remark_required_on_fail
FROM final_template
JOIN item_seed ON true
JOIN public.project_acceptance_template_sections section
  ON section.template_id = final_template.id
  AND section.title = item_seed.section_title
WHERE NOT EXISTS (
  SELECT 1
  FROM public.project_acceptance_template_items existing
  WHERE existing.template_id = final_template.id
    AND existing.title = item_seed.title
);

ALTER TABLE public.expense_request_categories
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS department_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS mode_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

ALTER TABLE public.expense_request_items
ADD COLUMN IF NOT EXISTS category_remark text;

COMMENT ON COLUMN public.expense_request_categories.description IS '费用分类说明';
COMMENT ON COLUMN public.expense_request_categories.department_codes IS '适用部门编码数组，空数组表示不限制';
COMMENT ON COLUMN public.expense_request_categories.mode_codes IS '适用费用模式数组，空数组表示不限制';
COMMENT ON COLUMN public.expense_request_categories.is_default IS '是否默认分类';
COMMENT ON COLUMN public.expense_request_items.category_remark IS '费用分类补充说明，例如其他分类的具体内容';

WITH seed_categories(code, name, description, sort) AS (
  VALUES
    ('material', '材料费', '主材、辅材、现场材料采购', 10),
    ('labor', '人工费', '临时人工、施工劳务', 20),
    ('transport', '交通费', '打车、油费、过路费、市内交通', 30),
    ('accommodation', '住宿费', '外出施工或出差住宿', 40),
    ('meal', '餐饮费', '工作餐、加班餐、出差餐饮', 50),
    ('tool_consumable', '工具/耗材', '小工具、易耗品、低值物料', 60),
    ('design', '设计相关', '打印、测量、设计资料等', 70),
    ('site_misc', '工地杂费', '工地现场零星费用', 80),
    ('office', '办公费用', '办公用品、资料、行政相关', 90),
    ('other', '其他', '不适合归入以上分类的费用', 999)
)
INSERT INTO public.expense_request_categories (
  tenant_id,
  code,
  name,
  status,
  sort,
  is_builtin,
  is_default,
  department_codes,
  mode_codes,
  description,
  remark
)
SELECT
  tenants.id,
  seed_categories.code,
  seed_categories.name,
  'active',
  seed_categories.sort,
  true,
  false,
  '[]'::jsonb,
  '[]'::jsonb,
  seed_categories.description,
  seed_categories.description
FROM public.tenants
CROSS JOIN seed_categories
ON CONFLICT (tenant_id, code) DO UPDATE
SET
  name = EXCLUDED.name,
  status = 'active',
  sort = EXCLUDED.sort,
  is_builtin = true,
  description = EXCLUDED.description,
  remark = COALESCE(public.expense_request_categories.remark, EXCLUDED.remark),
  department_codes = COALESCE(public.expense_request_categories.department_codes, '[]'::jsonb),
  mode_codes = COALESCE(public.expense_request_categories.mode_codes, '[]'::jsonb),
  is_default = COALESCE(public.expense_request_categories.is_default, false);

UPDATE public.expense_request_categories
SET
  status = 'disabled',
  description = COALESCE(description, '历史内置分类，已由餐饮费等标准分类替代'),
  remark = COALESCE(remark, '历史内置分类，已由餐饮费等标准分类替代')
WHERE code = 'hospitality'
  AND is_builtin = true;

UPDATE public.expense_request_items
SET category_code = 'meal'
WHERE category_code = 'hospitality'
  AND category IN ('餐饮费', '工作餐', '加班餐', '餐费');

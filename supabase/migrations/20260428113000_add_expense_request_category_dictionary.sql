CREATE TABLE IF NOT EXISTS public.expense_request_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  sort integer NOT NULL DEFAULT 0,
  is_builtin boolean NOT NULL DEFAULT false,
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expense_request_categories_status_check
    CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text]))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_request_categories_code
ON public.expense_request_categories(code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_request_categories_name
ON public.expense_request_categories(name);

CREATE INDEX IF NOT EXISTS idx_expense_request_categories_status_sort
ON public.expense_request_categories(status, sort);

COMMENT ON TABLE public.expense_request_categories IS '费用分类字典';
COMMENT ON COLUMN public.expense_request_categories.code IS '费用分类稳定编码';
COMMENT ON COLUMN public.expense_request_categories.name IS '费用分类名称';
COMMENT ON COLUMN public.expense_request_categories.status IS '费用分类状态';
COMMENT ON COLUMN public.expense_request_categories.sort IS '费用分类排序';
COMMENT ON COLUMN public.expense_request_categories.is_builtin IS '是否系统内置';

DROP TRIGGER IF EXISTS tr_expense_request_categories_updated_at
ON public.expense_request_categories;

CREATE TRIGGER tr_expense_request_categories_updated_at
  BEFORE UPDATE ON public.expense_request_categories
  FOR EACH ROW
  EXECUTE PROCEDURE update_updated_at_column();

ALTER TABLE public.expense_request_items
ADD COLUMN IF NOT EXISTS category_code text;

COMMENT ON COLUMN public.expense_request_items.category_code IS '费用分类稳定编码';

INSERT INTO public.expense_request_categories (
  code,
  name,
  status,
  sort,
  is_builtin,
  remark
)
VALUES
  ('material', '材料费', 'active', 10, true, '材料采购、辅料支出'),
  ('transport', '运输费', 'active', 20, true, '物流、搬运、配送支出'),
  ('labor', '人工费', 'active', 30, true, '人工施工及劳务支出'),
  ('hospitality', '招待费', 'active', 40, true, '客户接待、茶饮等支出'),
  ('office', '办公费', 'active', 50, true, '办公用品及日常办公支出'),
  ('other', '其他', 'active', 999, true, '未覆盖分类的兜底项')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  sort = EXCLUDED.sort,
  is_builtin = EXCLUDED.is_builtin,
  remark = EXCLUDED.remark;

UPDATE public.expense_request_items
SET category_code = 'material'
WHERE category_code IS NULL
  AND category IN ('材料费', '材料', '材料采购');

UPDATE public.expense_request_items
SET category_code = 'transport'
WHERE category_code IS NULL
  AND category IN ('运输费', '运费', '物流费');

UPDATE public.expense_request_items
SET category_code = 'labor'
WHERE category_code IS NULL
  AND category IN ('人工费', '劳务费');

UPDATE public.expense_request_items
SET category_code = 'hospitality'
WHERE category_code IS NULL
  AND category IN ('招待费', '接待费');

UPDATE public.expense_request_items
SET category_code = 'office'
WHERE category_code IS NULL
  AND category IN ('办公费', '办公用品');

UPDATE public.expense_request_items
SET category_code = 'other'
WHERE category_code IS NULL
  AND category = '其他';

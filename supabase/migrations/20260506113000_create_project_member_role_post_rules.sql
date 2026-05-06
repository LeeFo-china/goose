CREATE TABLE IF NOT EXISTS public.project_member_role_post_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code varchar(64) NOT NULL,
  post_code varchar(64) NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_member_role_post_rules_role_code_check
    CHECK (
      role_code = ANY (
        ARRAY[
          'customer_owner'::text,
          'designer'::text,
          'supervisor'::text,
          'construction_manager'::text,
          'budget_manager'::text,
          'material_manager'::text,
          'site_manager'::text,
          'sales_followup'::text
        ]
      )
    ),
  CONSTRAINT project_member_role_post_rules_post_code_fkey
    FOREIGN KEY (post_code)
    REFERENCES public.posts(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT project_member_role_post_rules_unique_role_post
    UNIQUE (role_code, post_code)
);

CREATE INDEX IF NOT EXISTS idx_project_member_role_post_rules_role_enabled_sort
ON public.project_member_role_post_rules(role_code, enabled, sort);

DROP TRIGGER IF EXISTS tr_project_member_role_post_rules_updated_at
ON public.project_member_role_post_rules;

CREATE TRIGGER tr_project_member_role_post_rules_updated_at
BEFORE UPDATE ON public.project_member_role_post_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.project_member_role_post_rules IS '项目成员角色与可选岗位编码映射表';
COMMENT ON COLUMN public.project_member_role_post_rules.role_code IS '项目成员角色编码';
COMMENT ON COLUMN public.project_member_role_post_rules.post_code IS '岗位业务编码，引用 posts.code';
COMMENT ON COLUMN public.project_member_role_post_rules.enabled IS '是否启用该映射';
COMMENT ON COLUMN public.project_member_role_post_rules.sort IS '候选岗位排序';

WITH rules(role_code, post_code, sort) AS (
  VALUES
    ('customer_owner', 'MARKETING_DIRECTOR', 10),
    ('customer_owner', 'SALES_MANAGER', 20),
    ('customer_owner', 'SALES_CONSULTANT', 30),
    ('customer_owner', 'TELESALES', 40),
    ('customer_owner', 'CHANNEL_MANAGER', 50),
    ('sales_followup', 'SALES_CONSULTANT', 10),
    ('sales_followup', 'TELESALES', 20),
    ('sales_followup', 'CHANNEL_MANAGER', 30),
    ('sales_followup', 'CUSTOMER_INVITER', 40),
    ('designer', 'DESIGN_DIRECTOR', 10),
    ('designer', 'CHIEF_DESIGNER', 20),
    ('designer', 'INTERIOR_DESIGNER', 30),
    ('supervisor', 'ENGINEERING_DIRECTOR', 10),
    ('supervisor', 'PROJECT_MANAGER', 20),
    ('supervisor', 'CONSTRUCTION_SUPER', 30),
    ('supervisor', 'QUALITY_INSPECTOR', 40),
    ('construction_manager', 'ENGINEERING_DIRECTOR', 10),
    ('construction_manager', 'PROJECT_MANAGER', 20),
    ('construction_manager', 'CONSTRUCTION_SUPER', 30),
    ('site_manager', 'PROJECT_MANAGER', 10),
    ('site_manager', 'CONSTRUCTION_SUPER', 20),
    ('site_manager', 'HYDROPOWER_FOREMAN', 30),
    ('site_manager', 'TILE_FOREMAN', 40),
    ('site_manager', 'CARPENTRY_FOREMAN', 50),
    ('site_manager', 'PAINT_FOREMAN', 60),
    ('budget_manager', 'FINANCE_MANAGER', 10),
    ('budget_manager', 'FINANCE_ACCOUNTANT', 20),
    ('budget_manager', 'COST_ACCOUNTANT', 30),
    ('material_manager', 'PROCUREMENT_MANAGER', 10),
    ('material_manager', 'PROCURE_OFFICER', 20),
    ('material_manager', 'MATERIAL_CLERK', 30),
    ('material_manager', 'WAREHOUSE_KEEPER', 40)
)
INSERT INTO public.project_member_role_post_rules (
  role_code,
  post_code,
  enabled,
  sort
)
SELECT
  rules.role_code,
  rules.post_code,
  true,
  rules.sort
FROM rules
WHERE EXISTS (
  SELECT 1
  FROM public.posts
  WHERE posts.code = rules.post_code
)
ON CONFLICT (role_code, post_code) DO UPDATE
SET
  enabled = EXCLUDED.enabled,
  sort = EXCLUDED.sort,
  updated_at = now();

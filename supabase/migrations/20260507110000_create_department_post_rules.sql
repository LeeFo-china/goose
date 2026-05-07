CREATE TABLE IF NOT EXISTS public.department_post_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code VARCHAR(50) NOT NULL,
  post_code VARCHAR(64) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT department_post_rules_department_code_fkey
    FOREIGN KEY (department_code)
    REFERENCES public.departments(code)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT department_post_rules_post_code_fkey
    FOREIGN KEY (post_code)
    REFERENCES public.posts(code)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT department_post_rules_unique_department_post
    UNIQUE (department_code, post_code)
);

CREATE INDEX IF NOT EXISTS idx_department_post_rules_department_enabled_sort
ON public.department_post_rules(department_code, enabled, sort);

CREATE INDEX IF NOT EXISTS idx_department_post_rules_post_enabled
ON public.department_post_rules(post_code, enabled);

DROP TRIGGER IF EXISTS tr_department_post_rules_updated_at
ON public.department_post_rules;

CREATE TRIGGER tr_department_post_rules_updated_at
BEFORE UPDATE ON public.department_post_rules
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO public.department_post_rules (
  department_code,
  post_code,
  enabled,
  sort,
  updated_at
)
SELECT
  department.code,
  post.code,
  TRUE,
  COALESCE(post.sort, 0),
  NOW()
FROM public.departments AS department
CROSS JOIN public.posts AS post
WHERE department.code IS NOT NULL
  AND post.code IS NOT NULL
ON CONFLICT (department_code, post_code) DO UPDATE SET
  enabled = public.department_post_rules.enabled,
  sort = EXCLUDED.sort,
  updated_at = NOW();

COMMENT ON TABLE public.department_post_rules IS '部门与可选岗位映射表';
COMMENT ON COLUMN public.department_post_rules.department_code IS '部门业务编码，引用 departments.code';
COMMENT ON COLUMN public.department_post_rules.post_code IS '岗位业务编码，引用 posts.code';
COMMENT ON COLUMN public.department_post_rules.enabled IS '是否允许该部门选择该岗位';
COMMENT ON COLUMN public.department_post_rules.sort IS '同部门下候选岗位排序';

ALTER TABLE public.department_post_rules
ADD COLUMN IF NOT EXISTS alias_name text NULL;

COMMENT ON COLUMN public.department_post_rules.alias_name IS '租户部门下岗位显示别名；为空时使用 posts.name';

CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  role_code text NOT NULL CHECK (
    role_code IN (
      'customer_owner',
      'designer',
      'supervisor',
      'construction_manager'
    )
  ),
  role_name text NULL,
  is_primary boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  deleted_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_project_members_project_id
ON public.project_members(project_id)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_members_employee_id
ON public.project_members(employee_id)
WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_unique_active_role
ON public.project_members(project_id, employee_id, role_code)
WHERE deleted_at IS NULL;

COMMENT ON TABLE public.project_members IS '项目协作成员表';
COMMENT ON COLUMN public.project_members.role_code IS '项目成员角色编码';
COMMENT ON COLUMN public.project_members.role_name IS '项目成员角色名称';
COMMENT ON COLUMN public.project_members.is_primary IS '是否该角色主负责人';
COMMENT ON COLUMN public.project_members.sort_order IS '前端展示排序';

INSERT INTO public.project_members (
  project_id,
  employee_id,
  role_code,
  role_name,
  is_primary,
  sort_order
)
SELECT
  p.id,
  p.designer_id,
  'designer',
  '主案设计',
  true,
  20
FROM public.projects p
WHERE p.designer_id IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.project_members (
  project_id,
  employee_id,
  role_code,
  role_name,
  is_primary,
  sort_order
)
SELECT
  p.id,
  p.supervisor_id,
  'supervisor',
  '施工管理',
  true,
  30
FROM public.projects p
WHERE p.supervisor_id IS NOT NULL
ON CONFLICT DO NOTHING;

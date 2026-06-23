create table if not exists public.project_procedure_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  workflow_instance_node_id uuid references public.workflow_instance_nodes(id) on delete set null,
  node_key text not null,
  stage_code text not null,
  assignee_employee_id uuid not null references public.employees(id),
  planned_start_date date not null,
  planned_duration_days integer not null check (planned_duration_days > 0),
  planned_end_date date generated always as (planned_start_date + (planned_duration_days - 1)) stored,
  status text not null check (status in ('planned', 'in_progress', 'completed', 'canceled')),
  started_by_employee_id uuid references public.employees(id),
  started_at timestamptz not null default now(),
  completed_by_employee_id uuid references public.employees(id),
  completed_at timestamptz,
  adjusted_by_employee_id uuid references public.employees(id),
  adjusted_at timestamptz,
  adjust_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_procedure_assignments_node_key_not_blank
    check (btrim(node_key) <> ''),
  constraint project_procedure_assignments_stage_code_not_blank
    check (btrim(stage_code) <> ''),
  constraint project_procedure_assignments_completed_state_check
    check (
      (status = 'completed' and completed_at is not null)
      or (status <> 'completed' and completed_at is null)
    )
);

create table if not exists public.project_procedure_assignment_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  assignment_id uuid not null references public.project_procedure_assignments(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  workflow_instance_id uuid not null references public.workflow_instances(id) on delete cascade,
  workflow_instance_node_id uuid references public.workflow_instance_nodes(id) on delete set null,
  action text not null check (action in ('start', 'adjust', 'complete', 'cancel')),
  before_snapshot jsonb,
  after_snapshot jsonb not null,
  reason text,
  operator_employee_id uuid references public.employees(id),
  created_at timestamptz not null default now(),
  constraint project_procedure_assignment_logs_snapshot_object_check
    check (
      (before_snapshot is null or jsonb_typeof(before_snapshot) = 'object')
      and jsonb_typeof(after_snapshot) = 'object'
    )
);

create unique index if not exists project_procedure_assignments_one_active_node_idx
  on public.project_procedure_assignments(tenant_id, workflow_instance_id, node_key)
  where status in ('planned', 'in_progress');

create index if not exists project_procedure_assignments_assignee_schedule_idx
  on public.project_procedure_assignments(
    tenant_id,
    assignee_employee_id,
    status,
    planned_start_date,
    planned_end_date
  );

create index if not exists project_procedure_assignments_project_instance_idx
  on public.project_procedure_assignments(
    tenant_id,
    project_id,
    workflow_instance_id,
    node_key
  );

create index if not exists project_procedure_assignments_status_end_idx
  on public.project_procedure_assignments(tenant_id, status, planned_end_date);

create index if not exists project_procedure_assignment_logs_assignment_idx
  on public.project_procedure_assignment_logs(tenant_id, assignment_id, created_at desc);

drop trigger if exists tr_project_procedure_assignments_updated_at
on public.project_procedure_assignments;

create trigger tr_project_procedure_assignments_updated_at
before update on public.project_procedure_assignments
for each row execute function update_updated_at_column();

insert into public.permissions (
  code,
  name,
  module,
  resource,
  action,
  description,
  status
)
values
  (
    'project_procedure.read',
    '查看工序派工',
    'project_procedure',
    'project_procedure',
    'read',
    '查看项目工序派工和排程',
    'active'
  ),
  (
    'project_procedure.assign',
    '开始工序派工',
    'project_procedure',
    'project_procedure',
    'assign',
    '开始工序并指定施工人员和排程',
    'active'
  ),
  (
    'project_procedure.adjust',
    '调整工序派工',
    'project_procedure',
    'project_procedure',
    'adjust',
    '调整工序施工人员和排程',
    'active'
  ),
  (
    'project_procedure.complete',
    '完成工序',
    'project_procedure',
    'project_procedure',
    'complete',
    '完成当前项目工序',
    'active'
  )
on conflict (code) do update set
  name = excluded.name,
  module = excluded.module,
  resource = excluded.resource,
  action = excluded.action,
  description = excluded.description,
  status = excluded.status,
  updated_at = now();

comment on table public.project_procedure_assignments
is '项目施工工序派工和排程运行记录，按 workflow instance node 绑定当前工序。';

comment on table public.project_procedure_assignment_logs
is '项目施工工序派工和排程操作审计日志。';

comment on column public.project_procedure_assignments.planned_duration_days
is '计划工期天数，按自然日计算，planned_end_date 为包含开始日的生成列。';

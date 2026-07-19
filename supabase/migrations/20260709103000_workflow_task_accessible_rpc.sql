create or replace function public.list_accessible_workflow_tasks(
  p_tenant_id uuid,
  p_employee_id uuid default null,
  p_role_codes text[] default '{}'::text[],
  p_permission_codes text[] default '{}'::text[],
  p_status text default 'pending',
  p_subject_type text default null,
  p_subject_id text default null,
  p_instance_id uuid default null,
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  id uuid,
  tenant_id uuid,
  instance_id uuid,
  instance_node_id uuid,
  definition_id uuid,
  version_id uuid,
  node_id uuid,
  node_key text,
  node_type text,
  title text,
  status text,
  assignee_employee_id uuid,
  assignee_role_code text,
  assignee_permission_code text,
  assignee_employee jsonb,
  due_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  instance jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_codes text[] := coalesce(p_role_codes, '{}'::text[]);
  v_permission_codes text[] := coalesce(p_permission_codes, '{}'::text[]);
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_offset integer := (greatest(coalesce(p_page, 1), 1) - 1)
    * least(greatest(coalesce(p_page_size, 20), 1), 100);
begin
  return query
  select
    task.id,
    task.tenant_id,
    task.instance_id,
    task.instance_node_id,
    task.definition_id,
    task.version_id,
    task.node_id,
    task.node_key,
    task.node_type,
    task.title,
    task.status,
    task.assignee_employee_id,
    task.assignee_role_code,
    task.assignee_permission_code,
    case
      when employee.id is null then null
      else jsonb_build_object(
        'id', employee.id,
        'name', employee.name,
        'avatar', employee.avatar
      )
    end as assignee_employee,
    task.due_at,
    task.completed_by,
    task.completed_at,
    task.created_at,
    task.updated_at,
    jsonb_build_object(
      'id', instance.id,
      'subject_type', instance.subject_type,
      'subject_id', instance.subject_id,
      'status', instance.status,
      'current_node_key', instance.current_node_key,
      'current_node_snapshot', instance.current_node_snapshot
    ) as instance,
    count(*) over() as total_count
  from public.workflow_tasks as task
  join public.workflow_instances as instance
    on instance.id = task.instance_id
    and instance.tenant_id = task.tenant_id
  left join public.employees as employee
    on employee.id = task.assignee_employee_id
    and employee.tenant_id = task.tenant_id
  where task.tenant_id = p_tenant_id
    and task.status = coalesce(nullif(p_status, ''), 'pending')
    and (p_subject_type is null or instance.subject_type = p_subject_type)
    and (p_subject_id is null or instance.subject_id = p_subject_id)
    and (p_instance_id is null or task.instance_id = p_instance_id)
    and (
      (p_employee_id is not null and task.assignee_employee_id = p_employee_id)
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code = any(v_role_codes)
        and task.assignee_permission_code is null
      )
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code is null
        and task.assignee_permission_code = any(v_permission_codes)
      )
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code = any(v_role_codes)
        and task.assignee_permission_code = any(v_permission_codes)
      )
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code is null
        and task.assignee_permission_code is null
      )
    )
  order by task.updated_at desc
  offset v_offset
  limit v_page_size;
end;
$$;

create or replace function public.list_accessible_project_workflow_tasks(
  p_tenant_id uuid,
  p_employee_id uuid default null,
  p_role_codes text[] default '{}'::text[],
  p_permission_codes text[] default '{}'::text[],
  p_project_ids text[] default '{}'::text[],
  p_limit integer default 100
)
returns table (
  id uuid,
  tenant_id uuid,
  instance_id uuid,
  instance_node_id uuid,
  definition_id uuid,
  version_id uuid,
  node_id uuid,
  node_key text,
  node_type text,
  title text,
  status text,
  assignee_employee_id uuid,
  assignee_role_code text,
  assignee_permission_code text,
  assignee_employee jsonb,
  due_at timestamptz,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  instance jsonb,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role_codes text[] := coalesce(p_role_codes, '{}'::text[]);
  v_permission_codes text[] := coalesce(p_permission_codes, '{}'::text[]);
  v_project_ids text[] := coalesce(p_project_ids, '{}'::text[]);
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 10000);
begin
  if cardinality(v_project_ids) = 0 then
    return;
  end if;

  return query
  select
    task.id,
    task.tenant_id,
    task.instance_id,
    task.instance_node_id,
    task.definition_id,
    task.version_id,
    task.node_id,
    task.node_key,
    task.node_type,
    task.title,
    task.status,
    task.assignee_employee_id,
    task.assignee_role_code,
    task.assignee_permission_code,
    case
      when employee.id is null then null
      else jsonb_build_object(
        'id', employee.id,
        'name', employee.name,
        'avatar', employee.avatar
      )
    end as assignee_employee,
    task.due_at,
    task.completed_by,
    task.completed_at,
    task.created_at,
    task.updated_at,
    jsonb_build_object(
      'id', instance.id,
      'subject_type', instance.subject_type,
      'subject_id', instance.subject_id,
      'status', instance.status,
      'current_node_key', instance.current_node_key,
      'current_node_snapshot', instance.current_node_snapshot
    ) as instance,
    count(*) over() as total_count
  from public.workflow_tasks as task
  join public.workflow_instances as instance
    on instance.id = task.instance_id
    and instance.tenant_id = task.tenant_id
  left join public.employees as employee
    on employee.id = task.assignee_employee_id
    and employee.tenant_id = task.tenant_id
  where task.tenant_id = p_tenant_id
    and task.status = 'pending'
    and instance.subject_type = 'project'
    and instance.subject_id = any(v_project_ids)
    and (
      (p_employee_id is not null and task.assignee_employee_id = p_employee_id)
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code = any(v_role_codes)
        and task.assignee_permission_code is null
      )
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code is null
        and task.assignee_permission_code = any(v_permission_codes)
      )
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code = any(v_role_codes)
        and task.assignee_permission_code = any(v_permission_codes)
      )
      or (
        task.assignee_employee_id is null
        and task.assignee_role_code is null
        and task.assignee_permission_code is null
      )
    )
  order by task.created_at asc
  limit v_limit;
end;
$$;

revoke all on function public.list_accessible_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text,
  text,
  text,
  uuid,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_accessible_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text,
  text,
  text,
  uuid,
  integer,
  integer
) to service_role;

revoke all on function public.list_accessible_project_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text[],
  integer
) from public, anon, authenticated;

grant execute on function public.list_accessible_project_workflow_tasks(
  uuid,
  uuid,
  text[],
  text[],
  text[],
  integer
) to service_role;

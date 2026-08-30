BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '5min';

-- Rollback: forward-fix by replacing or dropping this additive read-only RPC.
create or replace function public.list_accessible_workflow_tasks_by_subject_ids(
  p_tenant_id uuid,
  p_subject_type text,
  p_subject_ids text[] default '{}'::text[],
  p_employee_id uuid default null,
  p_role_codes text[] default '{}'::text[],
  p_permission_codes text[] default '{}'::text[],
  p_limit integer default 100
)
returns table (
  id uuid,
  instance_id uuid,
  instance_node_id uuid,
  node_id uuid,
  node_key text,
  node_type text,
  title text,
  status text,
  assignee_employee_id uuid,
  assignee_role_code text,
  assignee_permission_code text,
  created_at timestamptz,
  instance jsonb
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subject_ids text[] := coalesce(p_subject_ids, '{}'::text[]);
  v_role_codes text[] := coalesce(p_role_codes, '{}'::text[]);
  v_permission_codes text[] := coalesce(p_permission_codes, '{}'::text[]);
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 100);
begin
  if nullif(btrim(p_subject_type), '') is null then
    raise exception 'WORKFLOW_SUBJECT_TYPE_REQUIRED' using errcode = '22023';
  end if;
  if cardinality(v_subject_ids) = 0 then
    return;
  end if;
  if cardinality(v_subject_ids) > 100 then
    raise exception 'WORKFLOW_SUBJECT_IDS_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  return query
  select
    task.id,
    task.instance_id,
    task.instance_node_id,
    task.node_id,
    task.node_key,
    task.node_type,
    task.title,
    task.status,
    task.assignee_employee_id,
    task.assignee_role_code,
    task.assignee_permission_code,
    task.created_at,
    jsonb_build_object(
      'id', instance.id,
      'subject_type', instance.subject_type,
      'subject_id', instance.subject_id,
      'status', instance.status,
      'current_node_key', instance.current_node_key,
      'current_node_snapshot', instance.current_node_snapshot
    ) as instance
  from public.workflow_tasks as task
  join public.workflow_instances as instance
    on instance.id = task.instance_id
    and instance.tenant_id = task.tenant_id
  where task.tenant_id = p_tenant_id
    and task.status = 'pending'
    and instance.subject_type = p_subject_type
    and instance.subject_id = any(v_subject_ids)
    and instance.status = 'running'
    and instance.current_node_key = task.node_key
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
  order by task.created_at asc, task.id asc
  limit v_limit;
end;
$$;

revoke all on function public.list_accessible_workflow_tasks_by_subject_ids(
  uuid,
  text,
  text[],
  uuid,
  text[],
  text[],
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.list_accessible_workflow_tasks_by_subject_ids(
  uuid,
  text,
  text[],
  uuid,
  text[],
  text[],
  integer
) to service_role;

COMMIT;

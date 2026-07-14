create or replace function public.get_project_operational_risk_page(
  p_tenant_id uuid,
  p_page integer default 1,
  p_page_size integer default 20,
  p_risk_type text default null,
  p_severity text default null,
  p_keyword text default null,
  p_timezone_name text default 'Asia/Shanghai'
) returns jsonb
language sql
stable
security invoker
set search_path = public
as $function$
with input as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    least(greatest(coalesce(p_page_size, 20), 1), 100) as page_size,
    case
      when p_risk_type is null then null
      when p_risk_type in (
        'workflow_task_overdue', 'procedure_overdue', 'missing_project_log',
        'acceptance_rework', 'service_ticket'
      ) then p_risk_type
      else '__invalid__'
    end as risk_type,
    case
      when p_severity is null then null
      when p_severity in ('warning', 'danger') then p_severity
      else '__invalid__'
    end as severity,
    nullif(left(btrim(coalesce(p_keyword, '')), 100), '') as keyword,
    coalesce(
      (select name from pg_timezone_names where name = p_timezone_name limit 1),
      'Asia/Shanghai'
    ) as timezone_name
), normalized as (
  select
    input.*,
    timezone(input.timezone_name, statement_timestamp()) as local_now,
    timezone(input.timezone_name, statement_timestamp())::date as business_date
  from input
), tenant_projects as (
  select
    projects.id,
    coalesce(nullif(btrim(projects.name), ''), '未命名项目') as name,
    coalesce(nullif(btrim(projects.status), ''), 'unknown') as status
  from public.projects as projects
  where projects.tenant_id = p_tenant_id
    and (projects.status is null or projects.status <> 'invalid')
), workflow_task_candidates as (
  select
    workflow_tasks.id,
    workflow_tasks.instance_id,
    workflow_tasks.node_key,
    workflow_tasks.title,
    workflow_tasks.status,
    workflow_tasks.assignee_employee_id,
    workflow_tasks.due_at
  from public.workflow_tasks as workflow_tasks
  cross join normalized
  where workflow_tasks.tenant_id = p_tenant_id
    and workflow_tasks.status = 'pending'
    and workflow_tasks.due_at is not null
    and workflow_tasks.due_at < statement_timestamp()
), workflow_task_risks as (
  select
    'workflow_task_overdue:' || workflow_task_candidates.id::text as risk_key,
    'workflow_task_overdue'::text as risk_type,
    case
      when greatest(
        normalized.business_date
          - timezone(normalized.timezone_name, workflow_task_candidates.due_at)::date,
        0
      ) >= 3 then 'danger'
      else 'warning'
    end as severity,
    tenant_projects.id as project_id,
    tenant_projects.name as project_name,
    tenant_projects.status as project_status,
    'workflow_task'::text as source_type,
    workflow_task_candidates.id as source_id,
    workflow_task_candidates.assignee_employee_id,
    employees.name as assignee_employee_name,
    workflow_task_candidates.due_at as occurred_at,
    workflow_task_candidates.due_at,
    greatest(
      normalized.business_date
        - timezone(normalized.timezone_name, workflow_task_candidates.due_at)::date,
      0
    )::integer as overdue_days,
    jsonb_build_object(
      'task_title', workflow_task_candidates.title,
      'node_key', workflow_task_candidates.node_key,
      'status', workflow_task_candidates.status,
      'due_at', workflow_task_candidates.due_at
    ) as evidence
  from workflow_task_candidates
  join public.workflow_instances as workflow_instances
    on workflow_instances.id = workflow_task_candidates.instance_id
   and workflow_instances.tenant_id = p_tenant_id
   and workflow_instances.subject_type = 'project'
  join tenant_projects
    on workflow_instances.subject_id = tenant_projects.id::text
  cross join normalized
  left join public.employees as employees
    on employees.id = workflow_task_candidates.assignee_employee_id
   and employees.tenant_id = p_tenant_id
), procedure_candidates as (
  select
    project_procedure_assignments.id,
    project_procedure_assignments.project_id,
    project_procedure_assignments.node_key,
    project_procedure_assignments.stage_code,
    project_procedure_assignments.assignee_employee_id,
    project_procedure_assignments.planned_start_date,
    project_procedure_assignments.planned_end_date,
    project_procedure_assignments.status
  from public.project_procedure_assignments as project_procedure_assignments
  cross join normalized
  where project_procedure_assignments.tenant_id = p_tenant_id
    and project_procedure_assignments.status in ('planned', 'in_progress')
    and project_procedure_assignments.planned_end_date < normalized.business_date
), procedure_risks as (
  select
    'procedure_overdue:' || procedure_candidates.id::text as risk_key,
    'procedure_overdue'::text as risk_type,
    case
      when (normalized.business_date - procedure_candidates.planned_end_date) >= 3
        then 'danger'
      else 'warning'
    end as severity,
    tenant_projects.id as project_id,
    tenant_projects.name as project_name,
    tenant_projects.status as project_status,
    'procedure_assignment'::text as source_type,
    procedure_candidates.id as source_id,
    procedure_candidates.assignee_employee_id,
    employees.name as assignee_employee_name,
    (procedure_candidates.planned_end_date::timestamp at time zone normalized.timezone_name) as occurred_at,
    (procedure_candidates.planned_end_date::timestamp at time zone normalized.timezone_name) as due_at,
    (normalized.business_date - procedure_candidates.planned_end_date)::integer as overdue_days,
    jsonb_build_object(
      'stage_code', procedure_candidates.stage_code,
      'node_key', procedure_candidates.node_key,
      'status', procedure_candidates.status,
      'planned_start_date', procedure_candidates.planned_start_date,
      'planned_end_date', procedure_candidates.planned_end_date
    ) as evidence
  from procedure_candidates
  join tenant_projects
    on tenant_projects.id = procedure_candidates.project_id
  cross join normalized
  left join public.employees as employees
    on employees.id = procedure_candidates.assignee_employee_id
   and employees.tenant_id = p_tenant_id
), active_project_procedures as (
  select distinct on (project_procedure_assignments.project_id)
    project_procedure_assignments.id,
    project_procedure_assignments.project_id,
    project_procedure_assignments.stage_code,
    project_procedure_assignments.status,
    project_procedure_assignments.planned_start_date,
    project_procedure_assignments.assignee_employee_id
  from public.project_procedure_assignments as project_procedure_assignments
  join tenant_projects
    on tenant_projects.id = project_procedure_assignments.project_id
  where project_procedure_assignments.tenant_id = p_tenant_id
    and project_procedure_assignments.status in ('planned', 'in_progress')
  order by
    project_procedure_assignments.project_id,
    case project_procedure_assignments.status when 'in_progress' then 0 else 1 end,
    project_procedure_assignments.planned_start_date,
    project_procedure_assignments.id
), project_log_context as (
  select
    active_project_procedures.*,
    latest_log.last_log_at,
    coalesce(today_log.has_today_log, false) as has_today_log
  from active_project_procedures
  cross join normalized
  left join lateral (
    select max(project_logs.created_at) as last_log_at
    from public.project_logs as project_logs
    where project_logs.tenant_id = p_tenant_id
      and project_logs.project_id = active_project_procedures.project_id
  ) as latest_log on true
  left join lateral (
    select true as has_today_log
    from public.project_logs as project_logs
    where project_logs.tenant_id = p_tenant_id
      and project_logs.project_id = active_project_procedures.project_id
      and timezone(normalized.timezone_name, project_logs.created_at)::date = normalized.business_date
    limit 1
  ) as today_log on true
), missing_project_log_risks as (
  select
    'missing_project_log:' || tenant_projects.id::text || ':' || normalized.business_date::text as risk_key,
    'missing_project_log'::text as risk_type,
    case
      when project_log_context.planned_start_date <= normalized.business_date - 2
        and (
          project_log_context.last_log_at is null
          or project_log_context.last_log_at < statement_timestamp() - interval '48 hours'
        )
        then 'danger'
      else 'warning'
    end as severity,
    tenant_projects.id as project_id,
    tenant_projects.name as project_name,
    tenant_projects.status as project_status,
    'project_log_gap'::text as source_type,
    project_log_context.id as source_id,
    project_log_context.assignee_employee_id,
    employees.name as assignee_employee_name,
    statement_timestamp() as occurred_at,
    null::timestamptz as due_at,
    case
      when project_log_context.planned_start_date <= normalized.business_date
        then (normalized.business_date - project_log_context.planned_start_date)::integer
      else null::integer
    end as overdue_days,
    jsonb_build_object(
      'stage_code', project_log_context.stage_code,
      'procedure_status', project_log_context.status,
      'planned_start_date', project_log_context.planned_start_date,
      'last_log_at', project_log_context.last_log_at,
      'business_date', normalized.business_date
    ) as evidence
  from project_log_context
  join tenant_projects
    on tenant_projects.id = project_log_context.project_id
  cross join normalized
  left join public.employees as employees
    on employees.id = project_log_context.assignee_employee_id
   and employees.tenant_id = p_tenant_id
  where tenant_projects.status in ('started', 'constructing')
    and extract(hour from normalized.local_now) >= 18
    and not project_log_context.has_today_log
), acceptance_risks as (
  select
    'acceptance_rework:' || project_acceptances.id::text as risk_key,
    'acceptance_rework'::text as risk_type,
    'danger'::text as severity,
    tenant_projects.id as project_id,
    tenant_projects.name as project_name,
    tenant_projects.status as project_status,
    'project_acceptance'::text as source_type,
    project_acceptances.id as source_id,
    project_acceptances.initiator_id as assignee_employee_id,
    employees.name as assignee_employee_name,
    coalesce(project_acceptances.rejected_at, project_acceptances.updated_at) as occurred_at,
    coalesce(project_acceptances.rejected_at, project_acceptances.updated_at) as due_at,
    null::integer as overdue_days,
    jsonb_build_object(
      'acceptance_type', project_acceptances.acceptance_type,
      'stage_code', project_acceptances.stage_code,
      'reject_source', project_acceptances.reject_source,
      'rejected_at', project_acceptances.rejected_at,
      'initiator_id', project_acceptances.initiator_id
    ) as evidence
  from public.project_acceptances as project_acceptances
  join tenant_projects
    on tenant_projects.id = project_acceptances.project_id
  left join public.employees as employees
    on employees.id = project_acceptances.initiator_id
   and employees.tenant_id = p_tenant_id
  where project_acceptances.tenant_id = p_tenant_id
    and project_acceptances.status = 'rejected'
), service_ticket_risks as (
  select
    'service_ticket:' || customer_service_tickets.id::text as risk_key,
    'service_ticket'::text as risk_type,
    case
      when customer_service_tickets.priority = 'urgent'
        or (
          customer_service_tickets.priority = 'high'
          and customer_service_tickets.created_at < statement_timestamp() - interval '48 hours'
        )
        then 'danger'
      else 'warning'
    end as severity,
    tenant_projects.id as project_id,
    tenant_projects.name as project_name,
    tenant_projects.status as project_status,
    'customer_service_ticket'::text as source_type,
    customer_service_tickets.id as source_id,
    customer_service_tickets.assigned_employee_id as assignee_employee_id,
    employees.name as assignee_employee_name,
    customer_service_tickets.created_at as occurred_at,
    customer_service_tickets.created_at as due_at,
    greatest(
      normalized.business_date
        - timezone(normalized.timezone_name, customer_service_tickets.created_at)::date,
      0
    )::integer as overdue_days,
    jsonb_build_object(
      'ticket_no', customer_service_tickets.ticket_no,
      'category', customer_service_tickets.category,
      'priority', customer_service_tickets.priority,
      'status', customer_service_tickets.status,
      'created_at', customer_service_tickets.created_at
    ) as evidence
  from public.customer_service_tickets as customer_service_tickets
  join tenant_projects
    on tenant_projects.id = customer_service_tickets.project_id
  cross join normalized
  left join public.employees as employees
    on employees.id = customer_service_tickets.assigned_employee_id
   and employees.tenant_id = p_tenant_id
  where customer_service_tickets.tenant_id = p_tenant_id
    and customer_service_tickets.status in ('open', 'in_progress')
    and customer_service_tickets.priority in ('high', 'urgent')
), workflow_task_diagnostics as (
  select
    count(*)::integer as workflow_tasks_missing_due_at
  from public.workflow_tasks as workflow_tasks
  join public.workflow_instances as workflow_instances
    on workflow_instances.id = workflow_tasks.instance_id
   and workflow_instances.tenant_id = p_tenant_id
   and workflow_instances.subject_type = 'project'
  join tenant_projects
    on tenant_projects.id::text = workflow_instances.subject_id
  where workflow_tasks.tenant_id = p_tenant_id
    and workflow_tasks.status = 'pending'
    and workflow_tasks.due_at is null
), risk_facts as (
  select
    risk_key,
    risk_type,
    severity,
    project_id,
    project_name,
    project_status,
    source_type,
    source_id,
    assignee_employee_id,
    assignee_employee_name,
    occurred_at,
    due_at,
    overdue_days,
    evidence
  from workflow_task_risks
  union all
  select
    risk_key,
    risk_type,
    severity,
    project_id,
    project_name,
    project_status,
    source_type,
    source_id,
    assignee_employee_id,
    assignee_employee_name,
    occurred_at,
    due_at,
    overdue_days,
    evidence
  from procedure_risks
  union all
  select
    risk_key,
    risk_type,
    severity,
    project_id,
    project_name,
    project_status,
    source_type,
    source_id,
    assignee_employee_id,
    assignee_employee_name,
    occurred_at,
    due_at,
    overdue_days,
    evidence
  from missing_project_log_risks
  union all
  select
    risk_key,
    risk_type,
    severity,
    project_id,
    project_name,
    project_status,
    source_type,
    source_id,
    assignee_employee_id,
    assignee_employee_name,
    occurred_at,
    due_at,
    overdue_days,
    evidence
  from acceptance_risks
  union all
  select
    risk_key,
    risk_type,
    severity,
    project_id,
    project_name,
    project_status,
    source_type,
    source_id,
    assignee_employee_id,
    assignee_employee_name,
    occurred_at,
    due_at,
    overdue_days,
    evidence
  from service_ticket_risks
), deduplicated as (
  select
    risk_key,
    risk_type,
    severity,
    project_id,
    project_name,
    project_status,
    source_type,
    source_id,
    assignee_employee_id,
    assignee_employee_name,
    occurred_at,
    due_at,
    overdue_days,
    evidence
  from (
    select
      risk_facts.*,
      row_number() over (
        partition by risk_key
        order by occurred_at desc nulls last
      ) as duplicate_rank
    from risk_facts
  ) ranked
  where duplicate_rank = 1
), filtered as (
  select deduplicated.*
  from deduplicated
  cross join input
  where (input.risk_type is null or deduplicated.risk_type = input.risk_type)
    and (input.severity is null or deduplicated.severity = input.severity)
    and (
      input.keyword is null
      or deduplicated.project_name ilike '%' || input.keyword || '%'
      or deduplicated.project_id::text = input.keyword
    )
), summary as (
  select
    count(*)::integer as total,
    count(*) filter (where severity = 'danger')::integer as danger,
    count(*) filter (where severity = 'warning')::integer as warning,
    count(distinct project_id)::integer as affected_projects
  from filtered
), paged as (
  select *
  from filtered
  order by
    case severity when 'danger' then 0 else 1 end,
    overdue_days desc nulls last,
    occurred_at desc nulls last,
    risk_key
  offset ((select page - 1 from input) * (select page_size from input))
  limit (select page_size from input)
)
select jsonb_build_object(
  'generated_at', statement_timestamp(),
  'business_date', (select business_date from normalized),
  'summary', jsonb_build_object(
    'total', coalesce((select total from summary), 0),
    'danger', coalesce((select danger from summary), 0),
    'warning', coalesce((select warning from summary), 0),
    'info', 0,
    'affected_projects', coalesce((select affected_projects from summary), 0),
    'by_type', jsonb_build_object(
      'workflow_task_overdue', (
        select count(*)::integer from filtered where risk_type = 'workflow_task_overdue'
      ),
      'procedure_overdue', (
        select count(*)::integer from filtered where risk_type = 'procedure_overdue'
      ),
      'missing_project_log', (
        select count(*)::integer from filtered where risk_type = 'missing_project_log'
      ),
      'acceptance_rework', (
        select count(*)::integer from filtered where risk_type = 'acceptance_rework'
      ),
      'service_ticket', (
        select count(*)::integer from filtered where risk_type = 'service_ticket'
      )
    )
  ),
  'diagnostics', jsonb_build_object(
    'workflow_tasks_missing_due_at',
    coalesce((select workflow_tasks_missing_due_at from workflow_task_diagnostics), 0)
  ),
  'items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'risk_key', paged.risk_key,
        'risk_type', paged.risk_type,
        'severity', paged.severity,
        'project_id', paged.project_id,
        'project_name', paged.project_name,
        'project_status', paged.project_status,
        'source_type', paged.source_type,
        'source_id', paged.source_id,
        'assignee_employee_id', paged.assignee_employee_id,
        'assignee_employee_name', paged.assignee_employee_name,
        'occurred_at', paged.occurred_at,
        'due_at', paged.due_at,
        'overdue_days', paged.overdue_days,
        'evidence', paged.evidence
      )
      order by
        case paged.severity when 'danger' then 0 else 1 end,
        paged.overdue_days desc nulls last,
        paged.occurred_at desc nulls last,
        paged.risk_key
    )
    from paged
  ), '[]'::jsonb),
  'pagination', jsonb_build_object(
    'page', (select page from input),
    'page_size', (select page_size from input),
    'total', coalesce((select total from summary), 0),
    'total_pages', case
      when coalesce((select total from summary), 0) = 0 then 0
      else ceil(
        coalesce((select total from summary), 0)::numeric
        / (select page_size from input)::numeric
      )::integer
    end
  )
);
$function$;

comment on function public.get_project_operational_risk_page(
  uuid, integer, integer, text, text, text, text
) is 'Dynamically calculates tenant-isolated project operational risks with database pagination capped at 100 rows and without writing business state.';

revoke all on function public.get_project_operational_risk_page(
  uuid, integer, integer, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.get_project_operational_risk_page(
  uuid, integer, integer, text, text, text, text
) to service_role;

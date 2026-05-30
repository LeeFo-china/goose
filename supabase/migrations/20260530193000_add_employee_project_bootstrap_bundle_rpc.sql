create or replace function public.get_employee_project_detail_bootstrap_data(
  p_project_id uuid,
  p_tenant_id uuid,
  p_log_limit integer default 5
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with params as (
  select greatest(1, least(coalesce(p_log_limit, 5), 10)) as log_limit
),
project_json as (
  select jsonb_build_object(
    'id', p.id,
    'tenant_id', p.tenant_id,
    'customer_id', p.customer_id,
    'property_id', p.property_id,
    'name', p.name,
    'status', p.status,
    'budget', p.budget,
    'signed_amount', p.signed_amount,
    'start_date', p.start_date,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'address', p.address,
    'style_tags', p.style_tags,
    'visibility_status', p.visibility_status,
    'customer', case
      when c.id is null then null
      else jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'phone', c.phone,
        'status', c.status,
        'owner_id', c.owner_id,
        'owner', case
          when owner.id is null then null
          else jsonb_build_object(
            'id', owner.id,
            'name', owner.name,
            'avatar', owner.avatar,
            'phone', owner.phone
          )
        end
      )
    end,
    'property', case
      when prop.id is null then null
      else jsonb_build_object(
        'id', prop.id,
        'community', prop.community,
        'building_info', prop.building_info,
        'layout', prop.layout,
        'area', prop.area,
        'latitude', prop.latitude,
        'longitude', prop.longitude
      )
    end,
    'designer', (
      select jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'avatar', e.avatar,
        'phone', e.phone
      )
      from public.project_members pm
      join public.employees e on e.id = pm.employee_id
      where pm.project_id = p.id
        and pm.role_code = 'designer'
        and pm.is_primary = true
        and pm.deleted_at is null
      order by pm.sort_order asc nulls last, pm.created_at asc
      limit 1
    ),
    'supervisor', (
      select jsonb_build_object(
        'id', e.id,
        'name', e.name,
        'avatar', e.avatar,
        'phone', e.phone
      )
      from public.project_members pm
      join public.employees e on e.id = pm.employee_id
      where pm.project_id = p.id
        and pm.role_code = 'supervisor'
        and pm.is_primary = true
        and pm.deleted_at is null
      order by pm.sort_order asc nulls last, pm.created_at asc
      limit 1
    )
  ) as value
  from public.projects p
  left join public.customers c on c.id = p.customer_id
  left join public.employees owner on owner.id = c.owner_id
  left join public.properties prop on prop.id = p.property_id
  where p.id = p_project_id
    and p.tenant_id = p_tenant_id
),
member_rows as (
  select
    pm.sort_order,
    pm.is_primary,
    pm.created_at,
    pm.role_name,
    jsonb_build_object(
      'id', pm.id,
      'project_id', pm.project_id,
      'employee_id', pm.employee_id,
      'role_code', pm.role_code,
      'role_name', pm.role_name,
      'is_primary', pm.is_primary,
      'sort_order', pm.sort_order,
      'created_at', pm.created_at,
      'updated_at', pm.updated_at,
      'deleted_at', pm.deleted_at,
      'employee', case
        when e.id is null then null
        else jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'avatar', e.avatar,
          'phone', e.phone,
          'tenant_department', case
            when td.id is null then null
            else jsonb_build_object(
              'id', td.id,
              'alias_name', td.alias_name,
              'code', td.code
            )
          end,
          'post', case
            when po.id is null then null
            else jsonb_build_object(
              'id', po.id,
              'name', po.name,
              'code', po.code
            )
          end
        )
      end
    ) as value
  from public.project_members pm
  left join public.employees e on e.id = pm.employee_id
  left join public.tenant_departments td on td.id = e.tenant_department_id
  left join public.posts po on po.id = e.post_id
  where pm.project_id = p_project_id
    and pm.deleted_at is null
),
acceptance_rows as (
  select to_jsonb(pa) as value
  from public.project_acceptances pa
  where pa.project_id = p_project_id
    and pa.tenant_id = p_tenant_id
    and pa.status <> 'cancelled'
  order by pa.created_at desc
),
log_stage_rows as (
  select jsonb_build_object('stage_code', pl.stage_code) as value
  from (
    select distinct stage_code
    from public.project_logs
    where project_id = p_project_id
      and tenant_id = p_tenant_id
      and stage_code is not null
  ) pl
),
latest_log_rows as (
  select jsonb_build_object(
    'id', ranked.id,
    'stage_code', ranked.stage_code,
    'node_name', ranked.node_name,
    'content', ranked.content,
    'created_at', ranked.created_at
  ) as value
  from (
    select distinct on (pl.stage_code)
      pl.id,
      pl.stage_code,
      pl.node_name,
      pl.content,
      pl.created_at
    from public.project_logs pl
    where pl.project_id = p_project_id
      and pl.tenant_id = p_tenant_id
      and pl.stage_code is not null
    order by pl.stage_code, pl.created_at desc
  ) ranked
),
lookahead_logs as (
  select pl.*
  from public.project_logs pl
  cross join params
  where pl.project_id = p_project_id
    and pl.tenant_id = p_tenant_id
  order by pl.created_at desc
  limit (select log_limit + 1 from params)
),
page_logs as (
  select ll.*
  from lookahead_logs ll
  order by ll.created_at desc
  limit (select log_limit from params)
),
log_rows as (
  select
    pl.created_at,
    jsonb_build_object(
      'id', pl.id,
      'project_id', pl.project_id,
      'tenant_id', pl.tenant_id,
      'employee_id', pl.employee_id,
      'stage_code', pl.stage_code,
      'node_name', pl.node_name,
      'content', pl.content,
      'images', pl.images,
      'created_at', pl.created_at,
      'employee', case
        when e.id is null then null
        else jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'avatar', e.avatar
        )
      end
    ) as value
  from page_logs pl
  left join public.employees e on e.id = pl.employee_id
),
comment_counts as (
  select jsonb_build_object(
    'log_id', plc.log_id,
    'comment_count', count(*)::integer
  ) as value
  from public.project_log_comments plc
  where plc.tenant_id = p_tenant_id
    and plc.deleted_at is null
    and plc.log_id in (select id from page_logs)
  group by plc.log_id
)
select jsonb_build_object(
  'project', (select value from project_json),
  'members', coalesce((
    select jsonb_agg(value order by sort_order asc nulls last, is_primary desc, created_at asc, role_name asc)
    from member_rows
  ), '[]'::jsonb),
  'acceptance_rows', coalesce((select jsonb_agg(value) from acceptance_rows), '[]'::jsonb),
  'log_stage_rows', coalesce((select jsonb_agg(value) from log_stage_rows), '[]'::jsonb),
  'latest_log_rows', coalesce((select jsonb_agg(value) from latest_log_rows), '[]'::jsonb),
  'logs', jsonb_build_object(
    'rows', coalesce((
      select jsonb_agg(value order by created_at desc)
      from log_rows
    ), '[]'::jsonb),
    'has_more', (select count(*) > (select log_limit from params) from lookahead_logs),
    'comment_counts', coalesce((select jsonb_agg(value) from comment_counts), '[]'::jsonb)
  )
);
$$;

comment on function public.get_employee_project_detail_bootstrap_data(uuid, uuid, integer)
  is 'Returns employee project detail bootstrap data in one database round trip.';

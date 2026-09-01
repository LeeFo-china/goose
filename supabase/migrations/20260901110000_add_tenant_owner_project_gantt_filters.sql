-- Rollback: drop public.list_tenant_owner_project_gantt and the four
-- idx_*_gantt_* indexes created below. This migration does not mutate data.

CREATE INDEX IF NOT EXISTS idx_projects_tenant_status_updated_id
ON public.projects(tenant_id, status, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_project_procedure_assignments_gantt_filter
ON public.project_procedure_assignments(
  tenant_id,
  workflow_instance_id,
  node_key,
  status,
  planned_end_date,
  planned_start_date
);

CREATE INDEX IF NOT EXISTS idx_project_members_gantt_owner
ON public.project_members(project_id, is_primary DESC, role_code, sort_order, created_at)
WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_project_acceptances_gantt_filter
ON public.project_acceptances(tenant_id, project_id, stage_code, updated_at DESC);

CREATE OR REPLACE FUNCTION public.list_tenant_owner_project_gantt(
  p_tenant_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20,
  p_keyword text DEFAULT NULL,
  p_window_start date DEFAULT NULL,
  p_window_end date DEFAULT NULL,
  p_timezone text DEFAULT 'Asia/Shanghai',
  p_risk text DEFAULT NULL
)
RETURNS TABLE (
  project_id uuid,
  project_name text,
  customer_name text,
  address_summary text,
  owner_employee_name text,
  project_status text,
  updated_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      greatest(coalesce(p_page, 1), 1) AS page,
      least(greatest(coalesce(p_page_size, 20), 1), 100) AS page_size,
      nullif(left(btrim(coalesce(p_keyword, '')), 100), '') AS keyword,
      p_window_start AS window_start,
      p_window_end AS window_end,
      coalesce(nullif(btrim(p_timezone), ''), 'Asia/Shanghai') AS timezone_name,
      nullif(btrim(p_risk), '') AS risk
  ),
  valid_input AS (
    SELECT
      input.*,
      timezone(timezones.name, statement_timestamp())::date AS business_date
    FROM input
    JOIN pg_catalog.pg_timezone_names AS timezones
      ON timezones.name = input.timezone_name
    WHERE (
      (input.window_start IS NULL AND input.window_end IS NULL)
      OR (
        input.window_start IS NOT NULL
        AND input.window_end IS NOT NULL
        AND input.window_start <= input.window_end
      )
    )
      AND (input.risk IS NULL OR input.risk IN ('delayed', 'blocked', 'unscheduled'))
  ),
  active_projects AS (
    SELECT
      projects.id,
      coalesce(nullif(btrim(projects.name), ''), '未命名项目') AS project_name,
      customers.name AS customer_name,
      coalesce(
        nullif(btrim(projects.address), ''),
        nullif(btrim(concat_ws(' ', properties.community, properties.building_info)), '')
      ) AS address_summary,
      owner_member.owner_employee_name,
      projects.status AS project_status,
      projects.updated_at
    FROM public.projects AS projects
    CROSS JOIN valid_input
    LEFT JOIN public.customers AS customers
      ON customers.id = projects.customer_id
      AND customers.tenant_id = p_tenant_id
    LEFT JOIN public.properties AS properties
      ON properties.id = projects.property_id
      AND properties.tenant_id = p_tenant_id
    LEFT JOIN LATERAL (
      SELECT employees.name AS owner_employee_name
      FROM public.project_members
      JOIN public.employees
        ON employees.id = project_members.employee_id
        AND employees.tenant_id = p_tenant_id
      WHERE project_members.project_id = projects.id
        AND project_members.deleted_at IS NULL
      ORDER BY
        (project_members.role_code = 'construction_manager') DESC,
        project_members.is_primary DESC,
        project_members.sort_order ASC,
        project_members.created_at ASC,
        project_members.id ASC
      LIMIT 1
    ) AS owner_member ON true
    WHERE projects.tenant_id = p_tenant_id
      AND projects.status IN (
        'designing',
        'proposal_confirmed',
        'signed',
        'design_finalized',
        'pending_start',
        'started',
        'constructing',
        'on_hold',
        'acceptance'
      )
      AND (
        valid_input.keyword IS NULL
        OR strpos(lower(concat_ws(
          ' ',
          projects.name,
          customers.name,
          projects.address,
          properties.community,
          properties.building_info,
          owner_member.owner_employee_name
        )), lower(valid_input.keyword)) > 0
        OR EXISTS (
          SELECT 1
          FROM public.project_members AS keyword_members
          JOIN public.employees
            ON employees.id = keyword_members.employee_id
            AND employees.tenant_id = p_tenant_id
          WHERE keyword_members.project_id = projects.id
            AND keyword_members.deleted_at IS NULL
            AND strpos(lower(coalesce(employees.name, '')), lower(valid_input.keyword)) > 0
        )
      )
  ),
  runtime_candidates AS (
    SELECT
      workflow_instances.*,
      row_number() OVER (
        PARTITION BY workflow_instances.subject_id
        ORDER BY
          (workflow_instances.status = 'running') DESC,
          workflow_instances.started_at DESC,
          workflow_instances.created_at DESC,
          workflow_instances.updated_at DESC,
          workflow_instances.id DESC
      ) AS runtime_rank
    FROM public.workflow_instances
    JOIN active_projects
      ON active_projects.id = workflow_instances.subject_id
    WHERE workflow_instances.tenant_id = p_tenant_id
      AND workflow_instances.subject_type = 'project'
      AND workflow_instances.status IN ('running', 'completed')
  ),
  latest_runtime AS (
    SELECT runtime_candidates.*
    FROM runtime_candidates
    WHERE runtime_candidates.runtime_rank = 1
  ),
  procedure_nodes AS (
    SELECT
      latest_runtime.subject_id AS project_id,
      latest_runtime.id AS workflow_instance_id,
      latest_runtime.current_node_key,
      node.value->>'node_key' AS node_key,
      node.value#>>'{config,stage_key}' AS stage_code,
      coalesce(node.value#>>'{config,trigger_acceptance}', 'false') = 'true'
        AS trigger_acceptance
    FROM latest_runtime
    JOIN public.workflow_versions
      ON workflow_versions.id = latest_runtime.version_id
      AND workflow_versions.definition_id = latest_runtime.definition_id
      AND workflow_versions.tenant_id = p_tenant_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(workflow_versions.snapshot->'nodes') = 'array'
          THEN workflow_versions.snapshot->'nodes'
        ELSE '[]'::jsonb
      END
    ) AS node(value)
    WHERE node.value->>'node_type' = 'procedure'
      AND nullif(btrim(node.value->>'node_key'), '') IS NOT NULL
  ),
  completed_nodes AS (
    SELECT DISTINCT
      workflow_instance_nodes.instance_id,
      workflow_instance_nodes.node_key
    FROM public.workflow_instance_nodes
    JOIN latest_runtime
      ON latest_runtime.id = workflow_instance_nodes.instance_id
    WHERE workflow_instance_nodes.tenant_id = p_tenant_id
      AND workflow_instance_nodes.status = 'completed'
  ),
  latest_assignments AS (
    SELECT DISTINCT ON (
      project_procedure_assignments.workflow_instance_id,
      project_procedure_assignments.node_key
    )
      project_procedure_assignments.workflow_instance_id,
      project_procedure_assignments.node_key,
      project_procedure_assignments.status AS assignment_status,
      project_procedure_assignments.planned_start_date,
      project_procedure_assignments.planned_end_date
    FROM public.project_procedure_assignments
    JOIN latest_runtime
      ON latest_runtime.id = project_procedure_assignments.workflow_instance_id
    WHERE project_procedure_assignments.tenant_id = p_tenant_id
    ORDER BY
      project_procedure_assignments.workflow_instance_id,
      project_procedure_assignments.node_key,
      project_procedure_assignments.updated_at DESC,
      project_procedure_assignments.id DESC
  ),
  latest_acceptances AS (
    SELECT DISTINCT ON (project_acceptances.project_id, project_acceptances.stage_code)
      project_acceptances.project_id,
      project_acceptances.stage_code,
      project_acceptances.status AS acceptance_status
    FROM public.project_acceptances
    JOIN active_projects
      ON active_projects.id = project_acceptances.project_id
    WHERE project_acceptances.tenant_id = p_tenant_id
    ORDER BY
      project_acceptances.project_id,
      project_acceptances.stage_code,
      project_acceptances.updated_at DESC,
      project_acceptances.id DESC
  ),
  procedure_facts AS (
    SELECT
      procedure_nodes.project_id,
      procedure_nodes.node_key,
      procedure_nodes.stage_code,
      procedure_nodes.trigger_acceptance,
      CASE
        WHEN procedure_nodes.node_key = procedure_nodes.current_node_key THEN 'current'
        WHEN completed_nodes.node_key IS NOT NULL THEN 'done'
        ELSE 'pending'
      END AS node_status,
      latest_assignments.assignment_status,
      latest_assignments.planned_start_date,
      latest_assignments.planned_end_date,
      latest_acceptances.acceptance_status
    FROM procedure_nodes
    LEFT JOIN completed_nodes
      ON completed_nodes.instance_id = procedure_nodes.workflow_instance_id
      AND completed_nodes.node_key = procedure_nodes.node_key
    LEFT JOIN latest_assignments
      ON latest_assignments.workflow_instance_id = procedure_nodes.workflow_instance_id
      AND latest_assignments.node_key = procedure_nodes.node_key
    LEFT JOIN latest_acceptances
      ON latest_acceptances.project_id = procedure_nodes.project_id
      AND latest_acceptances.stage_code = procedure_nodes.stage_code
  ),
  filtered_projects AS (
    SELECT active_projects.*
    FROM active_projects
    WHERE (
      (
        (SELECT window_start FROM valid_input) IS NULL
        AND (SELECT window_end FROM valid_input) IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM procedure_facts
        WHERE procedure_facts.project_id = active_projects.id
          AND coalesce(
            procedure_facts.planned_start_date,
            procedure_facts.planned_end_date
          ) <= (SELECT window_end FROM valid_input)
          AND coalesce(
            procedure_facts.planned_end_date,
            procedure_facts.planned_start_date
          ) >= (SELECT window_start FROM valid_input)
      )
    )
      AND (
        (SELECT risk FROM valid_input) IS NULL
        OR (
          (SELECT risk FROM valid_input) = 'delayed'
          AND EXISTS (
            SELECT 1
            FROM procedure_facts
            WHERE procedure_facts.project_id = active_projects.id
              AND procedure_facts.assignment_status NOT IN ('completed', 'canceled')
              AND procedure_facts.planned_end_date < (SELECT business_date FROM valid_input)
          )
        )
        OR (
          (SELECT risk FROM valid_input) = 'blocked'
          AND EXISTS (
            SELECT 1
            FROM procedure_facts
            WHERE procedure_facts.project_id = active_projects.id
              AND procedure_facts.node_status = 'done'
              AND procedure_facts.trigger_acceptance
              AND procedure_facts.acceptance_status IS DISTINCT FROM 'customer_confirmed'
          )
        )
        OR (
          (SELECT risk FROM valid_input) = 'unscheduled'
          AND EXISTS (
            SELECT 1
            FROM procedure_facts
            WHERE procedure_facts.project_id = active_projects.id
              AND procedure_facts.node_status IN ('current', 'pending')
              AND (
                procedure_facts.planned_start_date IS NULL
                OR procedure_facts.planned_end_date IS NULL
              )
          )
        )
      )
  ),
  totals AS (
    SELECT count(*)::bigint AS total_count
    FROM filtered_projects
  ),
  paged_projects AS (
    SELECT filtered_projects.*
    FROM filtered_projects
    ORDER BY filtered_projects.updated_at DESC, filtered_projects.id DESC
    OFFSET ((SELECT page FROM valid_input) - 1) * (SELECT page_size FROM valid_input)
    LIMIT (SELECT page_size FROM valid_input)
  )
  SELECT
    paged_projects.id AS project_id,
    paged_projects.project_name,
    paged_projects.customer_name,
    paged_projects.address_summary,
    paged_projects.owner_employee_name,
    paged_projects.project_status,
    paged_projects.updated_at,
    totals.total_count
  FROM totals
  LEFT JOIN paged_projects ON true
  ORDER BY paged_projects.updated_at DESC NULLS LAST, paged_projects.id DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.list_tenant_owner_project_gantt(
  uuid,
  integer,
  integer,
  text,
  date,
  date,
  text,
  text
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_tenant_owner_project_gantt(
  uuid,
  integer,
  integer,
  text,
  date,
  date,
  text,
  text
) TO service_role;

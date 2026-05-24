type ConstructionStageIssueRow = {
  issue_type: string;
  tenant_id: string | null;
  project_id: string;
  project_status: string | null;
  stage_code: string | null;
  prerequisite_stage_code: string | null;
  record_id: string | null;
  detail: string;
};

type ConstructionStageIssueSummaryRow = {
  issue_type: string;
  issue_count: number;
};

type ConstructionStageCheckResultRow = {
  summary: ConstructionStageIssueSummaryRow[] | string | null;
  issues: ConstructionStageIssueRow[] | string | null;
};

const databaseUrl = process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_DIRECT_URL;

if (!databaseUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  process.exit(1);
}

const detailLimit = Number(process.env.CONSTRUCTION_STAGE_CHECK_LIMIT || 200);
const db = new Bun.SQL(databaseUrl);

async function main() {
  const rows = await db<ConstructionStageCheckResultRow[]>`
  with stage_order(stage_code, ord) as (
    values
      ('demolition', 1),
      ('plumbing_electrical', 2),
      ('tiling', 3),
      ('woodwork', 4),
      ('painting', 5),
      ('installation', 6)
  ),
  latest_acceptances as (
    select distinct on (tenant_id, project_id, stage_code)
      id,
      tenant_id,
      project_id,
      stage_code,
      status,
      created_at
    from public.project_acceptances
    where coalesce(status, '') <> 'cancelled'
      and stage_code in (select stage_code from stage_order)
    order by tenant_id, project_id, stage_code, created_at desc
  ),
  accepted_stages as (
    select tenant_id, project_id, stage_code
    from latest_acceptances
    where status = 'customer_confirmed'
  ),
  log_issues as (
    select
      'project_log_stage_prerequisite_missing'::text as issue_type,
      p.tenant_id,
      p.id as project_id,
      p.status as project_status,
      l.stage_code,
      prev.stage_code as prerequisite_stage_code,
      l.id as record_id,
      ('施工日志已进入 ' || l.stage_code || '，但前置阶段 ' || prev.stage_code || ' 未验收通过')::text as detail
    from public.project_logs l
    join public.projects p
      on p.id = l.project_id
     and (p.tenant_id = l.tenant_id or l.tenant_id is null)
    join stage_order current_stage
      on current_stage.stage_code = l.stage_code
    join stage_order prev
      on prev.ord = current_stage.ord - 1
    where not exists (
      select 1
      from accepted_stages a
      where a.project_id = l.project_id
        and (a.tenant_id = l.tenant_id or l.tenant_id is null)
        and a.stage_code = prev.stage_code
    )
  ),
  acceptance_issues as (
    select
      'project_acceptance_stage_prerequisite_missing'::text as issue_type,
      p.tenant_id,
      p.id as project_id,
      p.status as project_status,
      a.stage_code,
      prev.stage_code as prerequisite_stage_code,
      a.id as record_id,
      ('工序验收已进入 ' || a.stage_code || '，但前置阶段 ' || prev.stage_code || ' 未验收通过')::text as detail
    from public.project_acceptances a
    join public.projects p
      on p.id = a.project_id
     and (p.tenant_id = a.tenant_id or a.tenant_id is null)
    join stage_order current_stage
      on current_stage.stage_code = a.stage_code
    join stage_order prev
      on prev.ord = current_stage.ord - 1
    where coalesce(a.status, '') <> 'cancelled'
      and not exists (
        select 1
        from accepted_stages accepted
        where accepted.project_id = a.project_id
          and (accepted.tenant_id = a.tenant_id or a.tenant_id is null)
          and accepted.stage_code = prev.stage_code
      )
  ),
  acceptance_project_issues as (
    select
      'project_acceptance_status_missing_required_stage'::text as issue_type,
      p.tenant_id,
      p.id as project_id,
      p.status as project_status,
      missing.stage_code,
      null::text as prerequisite_stage_code,
      p.id as record_id,
      ('项目已进入竣工验收，但必需施工阶段 ' || missing.stage_code || ' 未验收通过')::text as detail
    from public.projects p
    cross join stage_order missing
    where p.status = 'acceptance'
      and not exists (
        select 1
        from accepted_stages accepted
        where accepted.project_id = p.id
          and accepted.tenant_id = p.tenant_id
          and accepted.stage_code = missing.stage_code
      )
  ),
  issues as (
    select * from log_issues
    union all
    select * from acceptance_issues
    union all
    select * from acceptance_project_issues
  ),
  issue_summary as (
    select issue_type, count(*)::int as issue_count
    from issues
    group by issue_type
  ),
  issue_details as (
    select *
    from issues
    order by issue_type, project_id, stage_code
    limit ${detailLimit}
  )
  select
    coalesce((
      select jsonb_agg(to_jsonb(issue_summary) order by issue_type)
      from issue_summary
    ), '[]'::jsonb) as summary,
    coalesce((
      select jsonb_agg(to_jsonb(issue_details) order by issue_type, project_id, stage_code)
      from issue_details
    ), '[]'::jsonb) as issues;
  `;

  const result = rows[0];
  const summary = normalizeJson<ConstructionStageIssueSummaryRow[]>(result?.summary, []);
  const issues = normalizeJson<ConstructionStageIssueRow[]>(result?.issues, []);


  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    detail_limit: detailLimit,
    summary,
    issues,
  }, null, 2));

  await db.close();
}

function normalizeJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

main().catch(async (error) => {
  await db.close();
  console.error(
    error instanceof Error ? error.message : "施工阶段一致性检查失败",
  );
  process.exit(1);
});

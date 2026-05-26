type RoleCode = "designer" | "supervisor";

type CliOptions = {
  apply: boolean;
  limit: number;
  tenantId: string | null;
};

type IssueSummaryRow = {
  issue_type: string;
  issue_count: number;
};

type IssueDetailRow = {
  issue_type: string;
  tenant_id: string | null;
  project_id: string;
  role_code: RoleCode;
  legacy_employee_id: string | null;
  member_id: string | null;
  member_employee_id: string | null;
  detail: string;
};

type BackfillReportRow = {
  summary: IssueSummaryRow[] | string | null;
  issues: IssueDetailRow[] | string | null;
};

type ApplyResultRow = {
  demoted_count: number;
  updated_count: number;
  inserted_count: number;
};

const databaseUrl = process.env.SUPABASE_DB_URL ||
  process.env.SUPABASE_DB_DIRECT_URL;

if (!databaseUrl) {
  console.error("缺少 SUPABASE_DB_URL 或 SUPABASE_DB_DIRECT_URL");
  process.exit(1);
}

const db = new Bun.SQL(databaseUrl);

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    limit: Number(process.env.PROJECT_MEMBER_BACKFILL_LIMIT || 200),
    tenantId: process.env.TENANT_ID || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || options.limit);
      index += 1;
      continue;
    }
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || null;
      index += 1;
    }
  }

  if (!Number.isFinite(options.limit) || options.limit <= 0) {
    throw new Error("--limit 必须是大于 0 的数字");
  }

  return options;
}

function normalizeJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "string") return JSON.parse(value) as T;
  return value;
}

async function buildReport(options: CliOptions) {
  const rows = await db<BackfillReportRow[]>`
  with legacy_targets as (
    select
      p.id as project_id,
      p.tenant_id,
      'designer'::text as role_code,
      '主案设计'::text as role_name,
      20::int as sort_order,
      p.designer_id as employee_id
    from public.projects p
    where p.designer_id is not null
      and (${options.tenantId}::uuid is null or p.tenant_id = ${options.tenantId}::uuid)
    union all
    select
      p.id as project_id,
      p.tenant_id,
      'supervisor'::text as role_code,
      '施工管理'::text as role_name,
      30::int as sort_order,
      p.supervisor_id as employee_id
    from public.projects p
    where p.supervisor_id is not null
      and (${options.tenantId}::uuid is null or p.tenant_id = ${options.tenantId}::uuid)
  ),
  targets as (
    select
      lt.*,
      e.id is not null as employee_exists,
      e.tenant_id as employee_tenant_id
    from legacy_targets lt
    left join public.employees e
      on e.id = lt.employee_id
  ),
  active_members as (
    select
      id,
      project_id,
      employee_id,
      role_code,
      is_primary
    from public.project_members
    where deleted_at is null
      and role_code in ('designer', 'supervisor')
  ),
  issue_rows as (
    select
      'missing_employee'::text as issue_type,
      t.tenant_id,
      t.project_id,
      t.role_code,
      t.employee_id as legacy_employee_id,
      null::uuid as member_id,
      null::uuid as member_employee_id,
      ('项目旧字段 ' || t.role_code || ' 指向的员工不存在')::text as detail
    from targets t
    where not t.employee_exists
    union all
    select
      'employee_tenant_mismatch'::text,
      t.tenant_id,
      t.project_id,
      t.role_code,
      t.employee_id,
      null::uuid,
      null::uuid,
      ('项目租户与旧字段员工租户不一致，employee_tenant_id=' || coalesce(t.employee_tenant_id::text, 'null'))::text
    from targets t
    where t.employee_exists
      and t.tenant_id is not null
      and t.employee_tenant_id is not null
      and t.tenant_id <> t.employee_tenant_id
    union all
    select
      'missing_member'::text,
      t.tenant_id,
      t.project_id,
      t.role_code,
      t.employee_id,
      null::uuid,
      null::uuid,
      ('旧字段员工缺少对应项目成员，role_code=' || t.role_code)::text
    from targets t
    where t.employee_exists
      and (t.tenant_id is null or t.employee_tenant_id is null or t.tenant_id = t.employee_tenant_id)
      and not exists (
        select 1
        from active_members m
        where m.project_id = t.project_id
          and m.role_code = t.role_code
          and m.employee_id = t.employee_id
      )
    union all
    select
      'legacy_member_not_primary'::text,
      t.tenant_id,
      t.project_id,
      t.role_code,
      t.employee_id,
      m.id,
      m.employee_id,
      ('旧字段员工已有项目成员记录，但不是该角色主责')::text
    from targets t
    join active_members m
      on m.project_id = t.project_id
     and m.role_code = t.role_code
     and m.employee_id = t.employee_id
    where t.employee_exists
      and (t.tenant_id is null or t.employee_tenant_id is null or t.tenant_id = t.employee_tenant_id)
      and coalesce(m.is_primary, false) = false
    union all
    select
      'competing_primary'::text,
      t.tenant_id,
      t.project_id,
      t.role_code,
      t.employee_id,
      m.id,
      m.employee_id,
      ('同一项目角色已有其他主责，需要按旧字段主责降级')::text
    from targets t
    join active_members m
      on m.project_id = t.project_id
     and m.role_code = t.role_code
     and m.employee_id <> t.employee_id
     and coalesce(m.is_primary, false) = true
    where t.employee_exists
      and (t.tenant_id is null or t.employee_tenant_id is null or t.tenant_id = t.employee_tenant_id)
    union all
    select
      'duplicate_primary'::text,
      p.tenant_id,
      m.project_id,
      m.role_code,
      null::uuid,
      null::uuid,
      null::uuid,
      ('同一项目角色存在多个主责，primary_count=' || count(*)::text)::text
    from active_members m
    join public.projects p
      on p.id = m.project_id
    where coalesce(m.is_primary, false) = true
      and (${options.tenantId}::uuid is null or p.tenant_id = ${options.tenantId}::uuid)
    group by p.tenant_id, m.project_id, m.role_code
    having count(*) > 1
  ),
  issue_summary as (
    select issue_type, count(*)::int as issue_count
    from issue_rows
    group by issue_type
  ),
  issue_details as (
    select *
    from issue_rows
    order by issue_type, tenant_id, project_id, role_code
    limit ${options.limit}
  )
  select
    coalesce((
      select jsonb_agg(to_jsonb(issue_summary) order by issue_type)
      from issue_summary
    ), '[]'::jsonb) as summary,
    coalesce((
      select jsonb_agg(to_jsonb(issue_details) order by issue_type, tenant_id, project_id, role_code)
      from issue_details
    ), '[]'::jsonb) as issues;
  `;

  const result = rows[0];
  return {
    summary: normalizeJson<IssueSummaryRow[]>(result?.summary, []),
    issues: normalizeJson<IssueDetailRow[]>(result?.issues, []),
  };
}

async function applyBackfill(options: CliOptions) {
  const rows = await db<ApplyResultRow[]>`
  with legacy_targets as (
    select
      p.id as project_id,
      p.tenant_id,
      'designer'::text as role_code,
      '主案设计'::text as role_name,
      20::int as sort_order,
      p.designer_id as employee_id
    from public.projects p
    where p.designer_id is not null
      and (${options.tenantId}::uuid is null or p.tenant_id = ${options.tenantId}::uuid)
    union all
    select
      p.id as project_id,
      p.tenant_id,
      'supervisor'::text as role_code,
      '施工管理'::text as role_name,
      30::int as sort_order,
      p.supervisor_id as employee_id
    from public.projects p
    where p.supervisor_id is not null
      and (${options.tenantId}::uuid is null or p.tenant_id = ${options.tenantId}::uuid)
  ),
  valid_targets as (
    select lt.*
    from legacy_targets lt
    join public.employees e
      on e.id = lt.employee_id
    where lt.tenant_id is null
      or e.tenant_id is null
      or lt.tenant_id = e.tenant_id
  ),
  demoted as (
    update public.project_members m
    set
      is_primary = false,
      updated_at = timezone('utc'::text, now())
    from valid_targets t
    where m.project_id = t.project_id
      and m.role_code = t.role_code
      and m.employee_id <> t.employee_id
      and m.deleted_at is null
      and coalesce(m.is_primary, false) = true
    returning m.id
  ),
  updated as (
    update public.project_members m
    set
      role_name = coalesce(m.role_name, t.role_name),
      is_primary = true,
      sort_order = coalesce(m.sort_order, t.sort_order),
      updated_at = timezone('utc'::text, now())
    from valid_targets t
    where m.project_id = t.project_id
      and m.employee_id = t.employee_id
      and m.role_code = t.role_code
      and m.deleted_at is null
    returning m.id
  ),
  inserted as (
    insert into public.project_members (
      project_id,
      employee_id,
      role_code,
      role_name,
      is_primary,
      sort_order
    )
    select
      t.project_id,
      t.employee_id,
      t.role_code,
      t.role_name,
      true,
      t.sort_order
    from valid_targets t
    where not exists (
      select 1
      from public.project_members m
      where m.project_id = t.project_id
        and m.employee_id = t.employee_id
        and m.role_code = t.role_code
        and m.deleted_at is null
    )
    returning id
  )
  select
    (select count(*)::int from demoted) as demoted_count,
    (select count(*)::int from updated) as updated_count,
    (select count(*)::int from inserted) as inserted_count;
  `;

  return rows[0] || {
    demoted_count: 0,
    updated_count: 0,
    inserted_count: 0,
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const before = await buildReport(options);

  if (!options.apply) {
    console.log(JSON.stringify({
      generated_at: new Date().toISOString(),
      mode: "dry-run",
      tenant_id: options.tenantId,
      detail_limit: options.limit,
      summary: before.summary,
      issues: before.issues,
    }, null, 2));
    return;
  }

  const applyResult = await applyBackfill(options);
  const after = await buildReport(options);

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: "apply",
    tenant_id: options.tenantId,
    detail_limit: options.limit,
    before_summary: before.summary,
    apply_result: applyResult,
    after_summary: after.summary,
    after_issues: after.issues,
  }, null, 2));
}

main().catch(async (error) => {
  console.error(
    error instanceof Error ? error.message : "项目成员责任人 backfill 失败",
  );
  process.exitCode = 1;
}).finally(async () => {
  await db.close();
});

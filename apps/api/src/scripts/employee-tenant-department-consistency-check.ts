type CliOptions = {
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
  employee_id: string;
  employee_name: string | null;
  employee_phone: string | null;
  employee_status: string | null;
  tenant_department_id: string | null;
  detail: string;
};

type CheckResultRow = {
  summary: IssueSummaryRow[] | string | null;
  issues: IssueDetailRow[] | string | null;
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
    limit: Number(process.env.EMPLOYEE_TENANT_DEPARTMENT_CHECK_LIMIT || 200),
    tenantId: process.env.TENANT_ID || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--apply") {
      throw new Error("employees.department_id 已清理，当前脚本不再支持 --apply");
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
  const rows = await db<CheckResultRow[]>`
  with active_employees as (
    select
      employee.id,
      employee.tenant_id,
      employee.name,
      employee.phone,
      employee.status,
      employee.tenant_department_id,
      tenant_department.id as current_tenant_department_id,
      tenant_department.tenant_id as current_tenant_department_tenant_id,
      tenant_department.enabled as current_tenant_department_enabled
    from public.employees employee
    left join public.tenant_departments tenant_department
      on tenant_department.id = employee.tenant_department_id
    where employee.status = 'active'
      and employee.tenant_id is not null
      and (${options.tenantId}::uuid is null or employee.tenant_id = ${options.tenantId}::uuid)
  ),
  issue_rows as (
    select
      'employee_missing_tenant_department'::text as issue_type,
      employee.tenant_id,
      employee.id as employee_id,
      employee.name as employee_name,
      employee.phone as employee_phone,
      employee.status as employee_status,
      employee.tenant_department_id,
      '在职员工缺少 tenant_department_id'::text as detail
    from active_employees employee
    where employee.tenant_department_id is null
    union all
    select
      'employee_tenant_department_tenant_mismatch'::text,
      employee.tenant_id,
      employee.id,
      employee.name,
      employee.phone,
      employee.status,
      employee.tenant_department_id,
      ('员工租户与租户部门租户不一致，tenant_department_tenant_id=' || coalesce(employee.current_tenant_department_tenant_id::text, 'null'))::text
    from active_employees employee
    where employee.tenant_department_id is not null
      and employee.current_tenant_department_id is not null
      and employee.tenant_id is not null
      and employee.current_tenant_department_tenant_id is not null
      and employee.tenant_id <> employee.current_tenant_department_tenant_id
    union all
    select
      'employee_tenant_department_disabled'::text,
      employee.tenant_id,
      employee.id,
      employee.name,
      employee.phone,
      employee.status,
      employee.tenant_department_id,
      '员工指向的租户部门已停用'::text
    from active_employees employee
    where employee.tenant_department_id is not null
      and coalesce(employee.current_tenant_department_enabled, false) = false
  ),
  issue_summary as (
    select issue_type, count(*)::int as issue_count
    from issue_rows
    group by issue_type
  ),
  issue_details as (
    select *
    from issue_rows
    order by issue_type, tenant_id, employee_id
    limit ${options.limit}
  )
  select
    coalesce((
      select jsonb_agg(to_jsonb(issue_summary) order by issue_type)
      from issue_summary
    ), '[]'::jsonb) as summary,
    coalesce((
      select jsonb_agg(to_jsonb(issue_details) order by issue_type, tenant_id, employee_id)
      from issue_details
    ), '[]'::jsonb) as issues;
  `;

  const result = rows[0];
  return {
    summary: normalizeJson<IssueSummaryRow[]>(result?.summary, []),
    issues: normalizeJson<IssueDetailRow[]>(result?.issues, []),
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const report = await buildReport(options);

  console.log(JSON.stringify({
    generated_at: new Date().toISOString(),
    mode: "dry-run",
    tenant_id: options.tenantId,
    detail_limit: options.limit,
    summary: report.summary,
    issues: report.issues,
  }, null, 2));
}

main().catch(async (error) => {
  console.error(
    error instanceof Error ? error.message : "员工租户部门一致性检查失败",
  );
  process.exitCode = 1;
}).finally(async () => {
  await db.close();
});

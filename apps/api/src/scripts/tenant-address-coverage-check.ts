type CliOptions = {
  limit: number;
};

type CoverageRow = {
  tenant_total: number;
  active_tenant_total: number;
  active_with_address: number;
  active_with_coordinate: number;
  active_confirmed: number;
  active_manual_address: number;
};

type IssueRow = {
  issue_type: string;
  issue_count: number;
};

type IssueDetailRow = {
  issue_type: string;
  tenant_id: string;
  tenant_name: string;
  detail: string;
};

type CheckRow = {
  coverage: CoverageRow[] | string | null;
  issue_summary: IssueRow[] | string | null;
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
  const options = {
    limit: Number(process.env.TENANT_ADDRESS_COVERAGE_LIMIT || 100),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || options.limit);
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
  const rows = await db<CheckRow[]>`
  with tenant_rows as (
    select *
    from public.tenants
  ),
  active_tenants as (
    select *
    from tenant_rows
    where status = 'active'
  ),
  coverage as (
    select
      (select count(*)::int from tenant_rows) as tenant_total,
      (select count(*)::int from active_tenants) as active_tenant_total,
      (
        select count(*)::int
        from active_tenants
        where address is not null and btrim(address) <> ''
      ) as active_with_address,
      (
        select count(*)::int
        from active_tenants
        where address_latitude is not null and address_longitude is not null
      ) as active_with_coordinate,
      (
        select count(*)::int
        from active_tenants
        where address_confirmed_at is not null
      ) as active_confirmed,
      (
        select count(*)::int
        from active_tenants
        where address_source = 'manual'
      ) as active_manual_address
  ),
  issue_rows as (
    select
      'active_missing_address'::text as issue_type,
      id as tenant_id,
      name as tenant_name,
      'active 租户缺少公司地址'::text as detail
    from active_tenants
    where address is null or btrim(address) = ''
    union all
    select
      'active_address_without_coordinate'::text,
      id,
      name,
      ('地址有文本但缺少经纬度：' || coalesce(address, ''))::text
    from active_tenants
    where address is not null
      and btrim(address) <> ''
      and (address_latitude is null or address_longitude is null)
    union all
    select
      'confirmed_without_coordinate'::text,
      id,
      name,
      '地址已确认但缺少经纬度'::text
    from active_tenants
    where address_confirmed_at is not null
      and (address_latitude is null or address_longitude is null)
  ),
  issue_summary as (
    select issue_type, count(*)::int as issue_count
    from issue_rows
    group by issue_type
  ),
  issue_details as (
    select *
    from issue_rows
    order by issue_type, tenant_name, tenant_id
    limit ${options.limit}
  )
  select
    jsonb_build_array(to_jsonb(coverage)) as coverage,
    coalesce((
      select jsonb_agg(to_jsonb(issue_summary) order by issue_type)
      from issue_summary
    ), '[]'::jsonb) as issue_summary,
    coalesce((
      select jsonb_agg(to_jsonb(issue_details) order by issue_type, tenant_name, tenant_id)
      from issue_details
    ), '[]'::jsonb) as issues
  from coverage;
  `;

  const result = rows[0];
  return {
    generated_at: new Date().toISOString(),
    mode: "dry-run",
    detail_limit: options.limit,
    coverage: normalizeJson<CoverageRow[]>(result?.coverage, [])[0] ?? null,
    issue_summary: normalizeJson<IssueRow[]>(result?.issue_summary, []),
    issues: normalizeJson<IssueDetailRow[]>(result?.issues, []),
  };
}

async function main() {
  const options = parseArgs(Bun.argv.slice(2));
  const report = await buildReport(options);
  console.log(JSON.stringify(report, null, 2));
  await db.close();
}

main().catch(async (error) => {
  await db.close();
  console.error(error instanceof Error ? error.message : "租户地址覆盖率检查失败");
  process.exit(1);
});

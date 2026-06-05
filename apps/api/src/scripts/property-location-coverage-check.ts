type CliOptions = {
  limit: number;
  tenantId: string | null;
};

type CoverageSummaryRow = {
  property_total: number;
  property_with_city: number;
  property_with_adcode: number;
  property_with_coordinate: number;
  property_confirmed: number;
  project_total: number;
  project_with_property: number;
  project_address_without_property: number;
};

type IssueSummaryRow = {
  issue_type: string;
  issue_count: number;
};

type IssueDetailRow = {
  issue_type: string;
  tenant_id: string | null;
  record_id: string;
  related_id: string | null;
  detail: string;
};

type CheckResultRow = {
  coverage: CoverageSummaryRow[] | string | null;
  issue_summary: IssueSummaryRow[] | string | null;
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
    limit: Number(process.env.PROPERTY_LOCATION_COVERAGE_LIMIT || 200),
    tenantId: process.env.TENANT_ID || null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") continue;
    if (arg === "--limit") {
      options.limit = Number(argv[index + 1] || options.limit);
      index += 1;
      continue;
    }
    if (arg === "--tenant-id") {
      options.tenantId = argv[index + 1] || null;
      index += 1;
      continue;
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
  with scoped_properties as (
    select *
    from public.properties property
    where ${options.tenantId}::uuid is null
      or property.tenant_id = ${options.tenantId}::uuid
  ),
  scoped_projects as (
    select *
    from public.projects project
    where ${options.tenantId}::uuid is null
      or project.tenant_id = ${options.tenantId}::uuid
  ),
  coverage as (
    select
      (select count(*)::int from scoped_properties) as property_total,
      (select count(*)::int from scoped_properties where city is not null and btrim(city) <> '') as property_with_city,
      (select count(*)::int from scoped_properties where adcode is not null and btrim(adcode) <> '') as property_with_adcode,
      (select count(*)::int from scoped_properties where latitude is not null and longitude is not null) as property_with_coordinate,
      (select count(*)::int from scoped_properties where location_status = 'confirmed') as property_confirmed,
      (select count(*)::int from scoped_projects) as project_total,
      (select count(*)::int from scoped_projects where property_id is not null) as project_with_property,
      (
        select count(*)::int
        from scoped_projects
        where property_id is null
          and address is not null
          and btrim(address) <> ''
      ) as project_address_without_property
  ),
  issue_rows as (
    select
      'property_missing_city'::text as issue_type,
      property.tenant_id,
      property.id as record_id,
      property.customer_id as related_id,
      ('房产缺少城市，小区=' || coalesce(property.community, ''))::text as detail
    from scoped_properties property
    where property.city is null or btrim(property.city) = ''
    union all
    select
      'property_missing_adcode'::text,
      property.tenant_id,
      property.id,
      property.customer_id,
      ('房产缺少 adcode，小区=' || coalesce(property.community, ''))::text
    from scoped_properties property
    where property.adcode is null or btrim(property.adcode) = ''
    union all
    select
      'property_missing_coordinate'::text,
      property.tenant_id,
      property.id,
      property.customer_id,
      ('房产缺少经纬度，小区=' || coalesce(property.community, ''))::text
    from scoped_properties property
    where property.latitude is null or property.longitude is null
    union all
    select
      'property_confirmed_without_full_location'::text,
      property.tenant_id,
      property.id,
      property.customer_id,
      ('房产已确认但缺少完整位置，小区=' || coalesce(property.community, ''))::text
    from scoped_properties property
    where property.location_status = 'confirmed'
      and (
        property.latitude is null
        or property.longitude is null
        or property.adcode is null
        or btrim(property.adcode) = ''
      )
    union all
    select
      'project_address_without_property'::text,
      project.tenant_id,
      project.id,
      project.customer_id,
      ('项目有地址但未关联房产，地址=' || coalesce(project.address, ''))::text
    from scoped_projects project
    where project.property_id is null
      and project.address is not null
      and btrim(project.address) <> ''
  ),
  issue_summary as (
    select issue_type, count(*)::int as issue_count
    from issue_rows
    group by issue_type
  ),
  issue_details as (
    select *
    from issue_rows
    order by issue_type, tenant_id, record_id
    limit ${options.limit}
  )
  select
    jsonb_build_array(to_jsonb(coverage)) as coverage,
    coalesce((
      select jsonb_agg(to_jsonb(issue_summary) order by issue_type)
      from issue_summary
    ), '[]'::jsonb) as issue_summary,
    coalesce((
      select jsonb_agg(to_jsonb(issue_details) order by issue_type, tenant_id, record_id)
      from issue_details
    ), '[]'::jsonb) as issues
  from coverage;
  `;

  const result = rows[0];
  return {
    generated_at: new Date().toISOString(),
    tenant_id: options.tenantId,
    detail_limit: options.limit,
    coverage: normalizeJson<CoverageSummaryRow[]>(result?.coverage, [])[0] ?? null,
    issue_summary: normalizeJson<IssueSummaryRow[]>(result?.issue_summary, []),
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
  console.error(error instanceof Error ? error.message : "房产位置覆盖率检查失败");
  process.exit(1);
});

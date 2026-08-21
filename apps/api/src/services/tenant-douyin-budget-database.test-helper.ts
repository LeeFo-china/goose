import { randomUUID } from "node:crypto";

export const PRICING_DATABASE_SCENARIOS = [
  "service_command_acl",
  "direct_write_closed",
  "empty_activation_rejected",
  "replace_token_advanced",
  "stale_replace_rejected",
  "six_base_activation_atomic",
  "archive_command",
  "fixture_cleanup",
] as const;

type Scenario = (typeof PRICING_DATABASE_SCENARIOS)[number];
type Summary = Record<Scenario, boolean>;
type JsonRecord = Record<string, unknown>;
type DatabaseSql = InstanceType<typeof Bun.SQL>;

const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

export function parseLocalPricingDatabaseUrl(input: string | undefined):
  | { ok: true; databaseUrl: string }
  | { ok: false } {
  const databaseUrl = input?.trim() || DEFAULT_LOCAL_DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      url.port !== "54322" ||
      url.pathname !== "/postgres" ||
      url.username !== "postgres" ||
      url.password !== "postgres" ||
      url.search !== "" ||
      url.hash !== ""
    ) return { ok: false };
    return { ok: true, databaseUrl };
  } catch {
    return { ok: false };
  }
}

export async function runTenantDouyinBudgetDatabaseIntegration(
  databaseUrl?: string,
): Promise<Summary> {
  const parsed = parseLocalPricingDatabaseUrl(databaseUrl);
  if (!parsed.ok) throw new Error("LOCAL_DATABASE_REQUIRED");
  const admin = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const service = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const ids = {
    tenant: randomUUID(),
    employee: randomUUID(),
    active: randomUUID(),
  };
  const summary = Object.fromEntries(
    PRICING_DATABASE_SCENARIOS.map((scenario) => [scenario, false]),
  ) as Summary;
  let failure: unknown;

  try {
    await createFixture(admin, ids);
    await service`set role service_role`;
    await service`set statement_timeout = '5s'`;
    await service`set lock_timeout = '2s'`;
    await runScenarios(admin, service, ids, summary);
  } catch (error) {
    failure = error;
  } finally {
    await service.close().catch(() => undefined);
    try {
      summary.fixture_cleanup = await cleanupFixture(admin, ids.tenant);
    } catch (cleanupError) {
      failure ??= cleanupError;
    }
    await admin.close().catch(() => undefined);
  }
  if (failure) throw new Error(stableFailure(failure));
  return summary;
}

async function runScenarios(
  admin: DatabaseSql,
  service: DatabaseSql,
  ids: { tenant: string; employee: string; active: string },
  summary: Summary,
) {
  const aclRows = await admin<Array<{
    service_create: boolean;
    anon_create: boolean;
    version_insert: boolean;
    version_update: boolean;
    item_delete: boolean;
  }>>`
    select
      has_function_privilege(
        'service_role',
        'public.create_douyin_budget_pricing_draft(uuid,uuid,timestamptz,timestamptz,text)',
        'EXECUTE'
      ) as service_create,
      has_function_privilege(
        'anon',
        'public.create_douyin_budget_pricing_draft(uuid,uuid,timestamptz,timestamptz,text)',
        'EXECUTE'
      ) as anon_create,
      has_table_privilege(
        'service_role', 'public.douyin_budget_pricing_versions', 'INSERT'
      ) as version_insert,
      has_table_privilege(
        'service_role', 'public.douyin_budget_pricing_versions', 'UPDATE'
      ) as version_update,
      has_table_privilege(
        'service_role', 'public.douyin_budget_pricing_items', 'DELETE'
      ) as item_delete;
  `;
  const acl = aclRows[0];
  summary.service_command_acl = acl?.service_create === true &&
    acl.anon_create === false;
  summary.direct_write_closed = acl?.version_insert === false &&
    acl.version_update === false && acl.item_delete === false;

  const created = await command(service, "create", {
    tenantId: ids.tenant,
    employeeId: ids.employee,
  });
  const draft = requireData(created);
  const draftId = requireString(draft.id);
  const initialToken = requireString(draft.updated_at);
  const emptyActivation = await command(service, "activate", {
    tenantId: ids.tenant,
    versionId: draftId,
    token: initialToken,
  });
  summary.empty_activation_rejected = errorCode(emptyActivation) ===
    "DOUYIN_BUDGET_PRICING_BASE_COVERAGE_INVALID";

  const items = buildSixBaseItems();
  const replaced = await command(service, "replace", {
    tenantId: ids.tenant,
    versionId: draftId,
    token: initialToken,
    items,
  });
  const replacedData = requireData(replaced);
  const nextToken = requireString(replacedData.updated_at);
  const tokenRows = await admin<Array<{ advanced: boolean }>>`
    select updated_at > ${initialToken}::timestamptz as advanced
    from public.douyin_budget_pricing_versions
    where id = ${draftId}::uuid;
  `;
  summary.replace_token_advanced = tokenRows[0]?.advanced === true &&
    nextToken !== initialToken;

  const stale = await command(service, "replace", {
    tenantId: ids.tenant,
    versionId: draftId,
    token: initialToken,
    items,
  });
  summary.stale_replace_rejected = errorCode(stale) ===
    "DOUYIN_BUDGET_PRICING_STALE";

  const activated = await command(service, "activate", {
    tenantId: ids.tenant,
    versionId: draftId,
    token: nextToken,
  });
  const statuses = await admin<Array<{ id: string; status: string }>>`
    select id::text, status
    from public.douyin_budget_pricing_versions
    where tenant_id = ${ids.tenant}::uuid;
  `;
  summary.six_base_activation_atomic = requireData(activated).status === "active"
    && statuses.find((row) => row.id === ids.active)?.status === "archived"
    && statuses.find((row) => row.id === draftId)?.status === "active";

  const activeData = requireData(activated);
  const archived = await command(service, "archive", {
    tenantId: ids.tenant,
    versionId: draftId,
    token: requireString(activeData.updated_at),
  });
  summary.archive_command = requireData(archived).status === "archived";
}

async function command(
  db: DatabaseSql,
  action: "create" | "replace" | "activate" | "archive",
  input: {
    tenantId: string;
    employeeId?: string;
    versionId?: string;
    token?: string;
    items?: JsonRecord[];
  },
): Promise<JsonRecord> {
  let rows: Array<{ result: JsonRecord }>;
  if (action === "create") {
    rows = await db<Array<{ result: JsonRecord }>>`
      select public.create_douyin_budget_pricing_draft(
        ${input.tenantId}::uuid, ${input.employeeId}::uuid,
        clock_timestamp() - interval '1 minute', null,
        '本地集成测试报价说明'
      ) as result;
    `;
  } else if (action === "replace") {
    rows = await db<Array<{ result: JsonRecord }>>`
      select public.replace_douyin_budget_pricing_items(
        ${input.tenantId}::uuid, ${input.versionId}::uuid,
        ${input.token}::timestamptz, ${input.items ?? []}::jsonb
      ) as result;
    `;
  } else {
    const functionName = action === "activate"
      ? "activate_douyin_budget_pricing_version"
      : "archive_douyin_budget_pricing_version";
    rows = await db.unsafe<Array<{ result: JsonRecord }>>(
      `select public.${functionName}($1::uuid,$2::uuid,$3::timestamptz) as result`,
      [input.tenantId, input.versionId, input.token],
    );
  }
  const result = rows[0]?.result;
  if (!result || typeof result !== "object") throw new Error("COMMAND_INVALID");
  return result;
}

async function createFixture(
  db: DatabaseSql,
  ids: { tenant: string; employee: string; active: string },
) {
  await db.begin(async (transaction) => {
    await transaction`insert into public.tenants (id,name,slug,status) values (
      ${ids.tenant}::uuid, '预算报价本地集成租户',
      ${`budget-pricing-${ids.tenant}`}, 'active'
    )`;
    await transaction`insert into public.employees (id,tenant_id,name,status)
      values (${ids.employee}::uuid,${ids.tenant}::uuid,'本地集成员工','active')`;
    await transaction`insert into public.douyin_budget_pricing_versions (
      id,tenant_id,version_no,status,effective_from,disclaimer,
      created_by_employee_id
    ) values (
      ${ids.active}::uuid,${ids.tenant}::uuid,1,'draft',
      clock_timestamp()-interval '1 day','原生效版本',${ids.employee}::uuid
    )`;
    await insertSixBaseItems(transaction, ids.active);
    await transaction`update public.douyin_budget_pricing_versions
      set status='active' where id=${ids.active}::uuid`;
  });
}

async function insertSixBaseItems(db: DatabaseSql, versionId: string) {
  await db`
    insert into public.douyin_budget_pricing_items (
      pricing_version_id,category_code,item_code,label,unit,minimum_amount,
      maximum_amount,condition_payload,sort_order,status
    ) select ${versionId}::uuid, item.category_code, item.item_code, item.label,
      item.unit, item.minimum_amount, item.maximum_amount,
      item.condition_payload, item.sort_order, item.status
    from jsonb_to_recordset(${buildSixBaseItems()}::jsonb) as item(
      category_code text,item_code text,label text,unit text,
      minimum_amount bigint,maximum_amount bigint,condition_payload jsonb,
      sort_order integer,status text
    );
  `;
}

function buildSixBaseItems(): JsonRecord[] {
  const properties = ["rough", "old_house"] as const;
  const tiers = ["economy", "comfortable", "quality"] as const;
  return tiers.flatMap((tier, tierIndex) => properties.map((property, index) => ({
    category_code: "base",
    item_code: `base.${tier}.${property}`,
    label: `${tier}-${property}`,
    unit: "sqm",
    minimum_amount: 80_000 + tierIndex * 10_000,
    maximum_amount: 100_000 + tierIndex * 10_000,
    condition_payload: {
      role: "base",
      property_conditions: [property],
      decoration_tiers: [tier],
      decoration_scopes: ["whole_house", "partial"],
      property_condition_coefficient_bps: 10_000,
      decoration_scope_coefficient_bps: {
        whole_house: 10_000,
        partial: 6_000,
      },
    },
    sort_order: tierIndex * 2 + index,
    status: "active",
  })));
}

async function cleanupFixture(db: DatabaseSql, tenantId: string) {
  await db.begin(async (transaction) => {
    await transaction`set local session_replication_role = replica`;
    await transaction`delete from public.douyin_budget_pricing_versions
      where tenant_id=${tenantId}::uuid`;
    await transaction`delete from public.employees where tenant_id=${tenantId}::uuid`;
    await transaction`delete from public.tenants where id=${tenantId}::uuid`;
  });
  const rows = await db<Array<{ count: number }>>`
    select count(*)::int as count from public.tenants where id=${tenantId}::uuid;
  `;
  return rows[0]?.count === 0;
}

function requireData(result: JsonRecord): JsonRecord {
  const value = result.data;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("COMMAND_DATA_INVALID");
  }
  return value as JsonRecord;
}

function requireString(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("STRING_REQUIRED");
  return value;
}

function errorCode(result: JsonRecord): string | null {
  const error = result.error;
  return error && typeof error === "object" && !Array.isArray(error) &&
      typeof (error as JsonRecord).code === "string"
    ? (error as JsonRecord).code as string
    : null;
}

function stableFailure(error: unknown): string {
  return error instanceof Error
    ? `PRICING_DATABASE_INTEGRATION_FAILED_${error.message}`
    : "PRICING_DATABASE_INTEGRATION_FAILED_UNKNOWN";
}

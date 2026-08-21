import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

const previousMigration = new URL(
  "../../../../../supabase/migrations/20260821105500_bind_douyin_appointment_subject_hash.sql",
  import.meta.url,
);
const hardeningMigration = new URL(
  "../../../../../supabase/migrations/20260821105600_harden_tenant_douyin_lead_workflow_api.sql",
  import.meta.url,
);
const replayRepairMigration = new URL(
  "../../../../../supabase/migrations/20260821105610_preserve_tenant_douyin_conversion_appointment_ownership.sql",
  import.meta.url,
);
const stalePreflightRepairMigration = new URL(
  "../../../../../supabase/migrations/20260821105620_reject_stale_douyin_customer_preflight.sql",
  import.meta.url,
);
const assignmentScopeRepairMigration = new URL(
  "../../../../../supabase/migrations/20260821105630_bind_douyin_assignee_department_scope.sql",
  import.meta.url,
);

function normalize(sql: string): string {
  return sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function functionBody(sql: string, functionName: string): string {
  const normalized = normalize(sql);
  const createMarker = `create function public.${functionName}`;
  const replaceMarker = `create or replace function public.${functionName}`;
  const start = Math.max(normalized.indexOf(createMarker),
    normalized.indexOf(replaceMarker));
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = normalized.indexOf("as $function$", start);
  const end = normalized.indexOf("$function$;", bodyStart + 13);
  expect(bodyStart).toBeGreaterThan(start);
  expect(end).toBeGreaterThan(bodyStart);
  return normalized.slice(start, end + 11);
}

function topLevelSql(sql: string): string {
  return normalize(sql)
    .replace(/create (?:or replace )?function .*?as \$function\$.*?\$function\$;/g,
      " ");
}

describe("tenant lead API hardening migration", () => {
  test("keeps the applied 105500 migration immutable", async () => {
    const bytes = await Bun.file(previousMigration).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
      .toBe("cb77cef7febdfe55376f528bf2572d888fa3639e5dee350d65d56879908def0b");
  });

  test("adds a coherent seven-argument conversion contract before writes", async () => {
    const sql = await Bun.file(hardeningMigration).text();
    const body = functionBody(sql, "convert_douyin_lead_to_customer");
    const conflict = body.indexOf("douyin_lead_customer_preflight_conflict");
    const customerInsert = body.indexOf("insert into public.customers");
    const leadUpdate = body.indexOf("update public.marketing_leads");

    expect(body).toContain("p_expected_customer_id uuid");
    expect(body).toContain("p_allow_customer_create boolean");
    expect(body).toContain("'expected_customer_id', p_expected_customer_id");
    expect(body).toContain("'allow_customer_create', p_allow_customer_create");
    expect(body).toContain("coalesce(v_lead.assigned_employee_id, p_actor_employee_id)");
    expect(body).toContain("'appointments_updated', 0");
    expect(conflict).toBeGreaterThanOrEqual(0);
    expect(conflict).toBeLessThan(customerInsert);
    expect(conflict).toBeLessThan(leadUpdate);
  });

  test("adds a bounded service-role-only latest appointment RPC", async () => {
    const sql = normalize(await Bun.file(hardeningMigration).text());
    const body = functionBody(sql, "list_tenant_douyin_lead_latest_appointments");

    expect(body).toContain("security definer");
    expect(body).toContain("set search_path = pg_catalog, public");
    expect(body).toContain("cardinality(p_marketing_lead_ids) > 100");
    expect(body).toContain("count(distinct requested.lead_id)");
    expect(body).toContain("row_number() over ( partition by appointment.marketing_lead_id");
    expect(body).toContain("appointment.tenant_id = p_tenant_id");
    expect(body).not.toContain("source_snapshot");
    expect(sql).toMatch(/revoke all on function public\.list_tenant_douyin_lead_latest_appointments\(\s*uuid, uuid\[\]\s*\) from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.list_tenant_douyin_lead_latest_appointments\(\s*uuid, uuid\[\]\s*\) to service_role/);
    expect(sql).toMatch(/revoke all on function public\.convert_douyin_lead_to_customer\(\s*uuid, uuid, uuid, integer, uuid\s*\) from service_role/);
    expect(sql).toMatch(/grant execute on function public\.convert_douyin_lead_to_customer\(\s*uuid, uuid, uuid, integer, uuid, uuid, boolean\s*\) to service_role/);
  });

  test("keeps 105600 immutable and repairs repeated ownership forward-only", async () => {
    const bytes = await Bun.file(hardeningMigration).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
      .toBe("dd22d58d0e1a56308577a7fa8c3a4c6b9d4b4a3789719affaa30529669938d57");
    const sql = await Bun.file(replayRepairMigration).text();
    const body = functionBody(sql, "convert_douyin_lead_to_customer");
    const repeated = body.indexOf("if v_lead.lead_status = 'converted' then");
    const appointmentLock = body.indexOf("perform appointment.id", repeated);
    const conflict = body.indexOf("douyin_lead_appointment_customer_conflict",
      appointmentLock);
    const resultWrite = body.indexOf("v_result := jsonb_build_object", conflict);
    const operationWrite = body.indexOf(
      "insert into public.douyin_lead_workflow_operations", repeated,
    );
    expect(repeated).toBeGreaterThanOrEqual(0);
    expect(appointmentLock).toBeGreaterThan(repeated);
    expect(body.slice(appointmentLock, conflict)).toContain("order by appointment.id");
    expect(body.slice(appointmentLock, conflict)).toContain("for update");
    expect(body.slice(appointmentLock, conflict))
      .toContain("appointment.customer_id is distinct from v_customer.id");
    expect(conflict).toBeLessThan(operationWrite);
    expect(normalize(sql)).toMatch(/create or replace function public\.convert_douyin_lead_to_customer/);
    const original = functionBody(await Bun.file(hardeningMigration).text(),
      "convert_douyin_lead_to_customer");
    const withoutRepair = (body.slice(0, appointmentLock) + body.slice(resultWrite))
      .replace("create or replace function", "create function");
    expect(withoutRepair).toBe(original);
    const statements = topLevelSql(sql).split(";")
      .map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(begin|set local |revoke all on function |grant execute on function |comment on function |commit$)/);
    }
  });

  test("keeps 105610 immutable and rejects stale create preflight before writes", async () => {
    const bytes = await Bun.file(replayRepairMigration).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
      .toBe("002c29c55e0ff33285c8c3d515218d11b4dd26bd78137e0b768b65ca8fcbf89f");
    const sql = await Bun.file(stalePreflightRepairMigration).text();
    const body = functionBody(sql, "convert_douyin_lead_to_customer");
    const repeated = body.indexOf("if v_lead.lead_status = 'converted' then");
    const guard = body.indexOf("if p_allow_customer_create then", repeated);
    const conflict = body.indexOf("douyin_lead_customer_preflight_conflict", guard);
    const stateCheck = body.indexOf("if v_lead.customer_id is null", conflict);
    const resultWrite = body.indexOf("v_result := jsonb_build_object", repeated);
    const operationWrite = body.indexOf(
      "insert into public.douyin_lead_workflow_operations", repeated,
    );

    expect(repeated).toBeGreaterThanOrEqual(0);
    expect(guard).toBeGreaterThan(repeated);
    expect(conflict).toBeGreaterThan(guard);
    expect(stateCheck).toBeGreaterThan(conflict);
    expect(conflict).toBeLessThan(resultWrite);
    expect(conflict).toBeLessThan(operationWrite);
    expect(body.slice(guard, stateCheck)).toContain("'status_code', 409");
    expect(body.slice(repeated, stateCheck)).not.toMatch(
      /(?:insert into|update|delete from) public\./,
    );
    const original = functionBody(await Bun.file(replayRepairMigration).text(),
      "convert_douyin_lead_to_customer");
    expect(body.slice(0, guard) + body.slice(stateCheck)).toBe(original);

    const normalized = normalize(sql);
    expect(normalized).toMatch(/revoke all on function public\.convert_douyin_lead_to_customer\(\s*uuid, uuid, uuid, integer, uuid, uuid, boolean\s*\) from public, anon, authenticated/);
    expect(normalized).toMatch(/grant execute on function public\.convert_douyin_lead_to_customer\(\s*uuid, uuid, uuid, integer, uuid, uuid, boolean\s*\) to service_role/);
    const statements = topLevelSql(sql).split(";")
      .map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(begin|set local |revoke all on function |grant execute on function |comment on function |commit$)/);
    }
  });

  test("keeps 105620 immutable and binds department assignment before writes", async () => {
    const bytes = await Bun.file(stalePreflightRepairMigration).arrayBuffer();
    expect(createHash("sha256").update(new Uint8Array(bytes)).digest("hex"))
      .toBe("0cd98361aeaeb4c8dbec5a8dcbe307e824c967aea6382e281f1dfe7f9d48f4a7");
    const sql = await Bun.file(assignmentScopeRepairMigration).text();
    const normalized = normalize(sql);
    const body = functionBody(sql, "assign_douyin_lead");
    const requestHash = body.indexOf("v_request_hash :=");
    const advisoryLock = body.indexOf("pg_catalog.pg_advisory_xact_lock");
    const operationReplay = body.indexOf("if found then", advisoryLock);
    const assigneeLock = body.indexOf("from public.employees as employee",
      operationReplay);
    const scopeConflict = body.indexOf("douyin_lead_assignee_scope_conflict",
      assigneeLock);
    const leadWrite = body.indexOf("update public.marketing_leads", scopeConflict);
    const operationWrite = body.indexOf(
      "insert into public.douyin_lead_workflow_operations", scopeConflict,
    );

    expect(body).toContain("p_expected_assignee_department_id uuid");
    expect(body.slice(requestHash, advisoryLock))
      .not.toContain("p_expected_assignee_department_id");
    expect(operationReplay).toBeGreaterThan(advisoryLock);
    expect(assigneeLock).toBeGreaterThan(operationReplay);
    expect(body.slice(assigneeLock, scopeConflict)).toContain("for share");
    expect(body.slice(assigneeLock, scopeConflict))
      .toContain("v_assignee_department_id is distinct from p_expected_assignee_department_id");
    expect(body.slice(assigneeLock, scopeConflict))
      .toContain("p_expected_assignee_department_id is not null");
    expect(body.slice(assigneeLock, scopeConflict)).toContain("'status_code', 409");
    expect(scopeConflict).toBeLessThan(leadWrite);
    expect(scopeConflict).toBeLessThan(operationWrite);

    expect(normalized).toMatch(/revoke all on function public\.assign_douyin_lead\(\s*uuid, uuid, uuid, uuid, integer, uuid\s*\) from service_role/);
    expect(normalized).toMatch(/grant execute on function public\.assign_douyin_lead\(\s*uuid, uuid, uuid, uuid, integer, uuid, uuid\s*\) to service_role/);
    for (const [column, indexName] of [
      ["name", "marketing_leads_douyin_name_trgm_idx"],
      ["phone", "marketing_leads_douyin_phone_trgm_idx"],
      ["community", "marketing_leads_douyin_community_trgm_idx"],
    ] as const) {
      const contract = `create index ${indexName} on public.marketing_leads `
        + `using gin (${column} extensions.gin_trgm_ops) `
        + "where source = 'douyin_miniapp'";
      expect(normalized).toContain(contract);
      expect(normalize(sql.replace(`CREATE INDEX ${indexName}`,
        `CREATE INDEX ${indexName}_removed`))).not.toContain(contract);
    }
    expect(normalized).not.toContain("create extension");
    const statements = topLevelSql(sql).split(";")
      .map((statement) => statement.trim()).filter(Boolean);
    for (const statement of statements) {
      expect(statement).toMatch(/^(begin|set local |create index |revoke all on function |grant execute on function |comment on (?:function|index) |commit$)/);
    }
  });
});

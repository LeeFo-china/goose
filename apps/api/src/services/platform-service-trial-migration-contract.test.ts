import { describe, expect, test } from "bun:test";

const migrationsDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
const minimumReleasedVersion = "20260811004000";

const normalizeSql = (sql: string) =>
  sql.replaceAll(/--.*$/gm, " ").replaceAll(/\s+/g, " ").trim().toLowerCase();

async function findMigration() {
  const glob = new Bun.Glob("*_create_platform_service_trials.sql");
  const names = Array.fromAsync(glob.scan({
    cwd: migrationsDirectory.pathname,
    onlyFiles: true,
  }));
  const files = (await names).sort();
  const name = files.at(-1) ?? "";
  return {
    name,
    text: name ? await Bun.file(new URL(name, migrationsDirectory)).text() : "",
  };
}

function functionDefinition(sql: string, name: string) {
  return sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
  ))?.[0] ?? "";
}

function functionBody(sql: string, name: string) {
  const definition = functionDefinition(sql, name);
  const start = definition.indexOf("\nAS $$\n");
  const end = definition.lastIndexOf("\n$$;");
  return normalizeSql(start < 0 || end < 0 ? "" : definition.slice(start, end));
}

function functionSignature(sql: string, name: string) {
  const definition = functionDefinition(sql, name);
  const end = definition.indexOf("\nRETURNS ");
  return normalizeSql(end < 0 ? "" : definition.slice(0, end));
}

function aclReference(name: string, argumentTypes: string) {
  return `public.${name}(${argumentTypes})`;
}

function expectServiceRoleOnly(sql: string, reference: string) {
  const normalized = normalizeSql(sql);
  for (const role of ["public", "anon", "authenticated"]) {
    expect(normalized).toContain(`revoke all on function ${reference} from ${role};`);
    expect(normalized).not.toContain(`grant execute on function ${reference} to ${role};`);
  }
  expect(normalized).toContain(`grant execute on function ${reference} to service_role;`);
}

describe("platform service trial core migration", () => {
  test("uses a forward migration after the latest released version", async () => {
    const migration = await findMigration();
    expect(migration.name).toMatch(/^\d{14}_create_platform_service_trials\.sql$/);
    expect(migration.name.slice(0, 14).localeCompare(minimumReleasedVersion)).toBeGreaterThan(0);
    expect(migration.text).not.toBe("");
  });

  test("locks and fails closed before any trial DDL", async () => {
    const migration = await findMigration();
    const sql = normalizeSql(migration.text);
    const begin = sql.indexOf("begin;");
    const timeout = sql.indexOf("set local lock_timeout = '5s';");
    const tenantLock = sql.indexOf("lock table public.tenants");
    const orderLock = sql.indexOf("lock table public.tenant_service_orders", tenantLock);
    const preflight = sql.indexOf("platform_service_trial_preflight");
    const ddl = sql.indexOf("create table public.platform_service_trial_policies");
    expect(timeout).toBeGreaterThan(begin);
    expect(tenantLock).toBeGreaterThan(timeout);
    expect(orderLock).toBeGreaterThan(tenantLock);
    expect(preflight).toBeGreaterThan(orderLock);
    expect(ddl).toBeGreaterThan(preflight);
    expect(sql.slice(begin, ddl)).not.toMatch(/\b(?:create|alter|drop)\s+(?:table|index|policy|trigger)\b/);
    expect(sql).toContain("platform_service_trial_preflight_partial_schema");
    expect(sql).toContain("platform_service_trial_preflight_order_source_invalid");
    expect(sql.slice(begin, ddl)).toContain("to_regprocedure('extensions.digest(text,text)')");
    expect(migration.text.toLowerCase()).toContain("forward-only");
    expect(migration.text.toLowerCase()).toContain("manual dml");
  });

  test("creates the four bounded aggregate tables with tenant-safe identities", async () => {
    const sql = normalizeSql((await findMigration()).text);
    for (const table of [
      "platform_service_trial_policies",
      "tenant_service_trials",
      "tenant_service_trial_events",
      "tenant_service_trial_commands",
    ]) expect(sql).toContain(`create table public.${table}`);
    expect(sql).not.toContain("tenant_service_trial_followups");
    expect(sql).toContain("unique (id, tenant_id)");
    expect(sql).toContain("foreign key (trial_id, tenant_id) references public.tenant_service_trials(id, tenant_id)");
    expect(sql).toContain("unique (scope_key, idempotency_key)");
    expect(sql).toContain("request_hash bytea not null");
    expect(sql).toContain("result_envelope jsonb not null");
    expect(sql).toContain("expires_at timestamptz not null");
    expect(sql).toContain("created_at + interval '90 days'");
    expect(sql).toContain("pg_column_size(metadata) <= 8192");
    expect(sql).toContain("pg_column_size(result_envelope) <= 16384");
  });

  test("stores the complete trial lifecycle facts and fail-closed checks", async () => {
    const sql = normalizeSql((await findMigration()).text);
    for (const column of [
      "enterprise_identity_hash bytea not null",
      "source text not null",
      "trial_type text not null",
      "status text not null",
      "application_reason text null",
      "expected_user_count integer null",
      "expected_project_count integer null",
      "contact_name text null",
      "contact_phone text null",
      "granted_by_employee_id uuid null",
      "reviewed_by_employee_id uuid null",
      "reviewed_at timestamptz null",
      "requested_at timestamptz null",
      "revoked_by_employee_id uuid null",
      "assignee_employee_id uuid null",
      "starts_at timestamptz null",
      "trial_ends_at timestamptz null",
      "grace_ends_at timestamptz null",
      "scope_snapshot jsonb not null",
      "policy_snapshot jsonb not null",
      "extension_count integer not null",
      "converted_order_id uuid null",
      "converted_at timestamptz null",
      "version integer not null",
    ]) expect(sql).toContain(column);
    expect(sql).toContain("check ((status in (");
    expect(sql).toContain(") is true)");
    expect(sql).toContain("tenant_service_trials_status_facts_check");
    expect(sql).toContain("status = 'converted' and converted_order_id is not null");
    expect(sql).toContain("granted_at is null and granted_by_employee_id is null");
    expect(sql).toContain("tenant_service_trials_conversion_facts_check");
    expect(sql).toContain("tenant_service_trials_duration_hard_limit_check");
    expect(sql).toContain("interval '365 days'");
    expect(sql).toContain("interval '30 days'");
  });

  test("seeds one current versioned policy with approved defaults", async () => {
    const sql = normalizeSql((await findMigration()).text);
    for (const fragment of [
      "trial_days integer not null default 30",
      "grace_days integer not null default 7",
      "reminder_days integer[] not null default array[7, 3, 1]",
      "max_trial_days integer not null default 60",
      "max_grace_days integer not null default 14",
      "max_schedule_days integer not null default 30",
      "max_extension_count integer not null default 1",
      "max_extension_days integer not null default 30",
      "reapply_cooldown_days integer not null default 30",
      "allow_repeat boolean not null default false",
      "version integer not null default 1",
      "where is_current = true",
    ]) expect(sql).toContain(fragment);
    for (const capability of [
      "core.projects", "core.customers", "core.employees",
      "core.workflows", "core.files", "core.notifications",
    ]) expect(sql).toContain(capability);
    expect(sql).toContain("standard_scope jsonb not null");
    expect(sql).toContain("guided_scope jsonb not null");
  });

  test("normalizes verified enterprise identity and takes locks in canonical order", async () => {
    const migration = await findMigration();
    const apply = functionBody(migration.text, "platform_service_trial_apply");
    const grant = functionBody(migration.text, "platform_service_trial_grant");
    for (const body of [apply, grant]) {
      expect(body).toContain("tenant.status = 'active'");
      expect(body).toContain("tenant.unified_social_credit_code");
      expect(body).toContain("public.tenant_onboarding_applications");
      expect(body).toContain("application.status = 'approved'");
      expect(body).toContain("application.converted_tenant_id = tenant.id");
      expect(body).toContain("application.reviewed_at is not null");
      expect(body).toContain("application.unified_social_credit_code");
      expect(body).toContain("regexp_replace(");
      expect(body).toContain("upper(btrim(");
      expect(body).toContain("extensions.digest(");
      expect(body).toContain("'sha256'");
      expect(body).toContain("service_trial_enterprise_identity_required");
      const enterpriseLock = body.indexOf("service-trial-enterprise:");
      const tenantLock = body.indexOf("service-trial-tenant:");
      expect(enterpriseLock).toBeGreaterThan(-1);
      expect(tenantLock).toBeGreaterThan(enterpriseLock);
      expect(body).toContain("service_trial_formal_service_active");
      expect(body).toContain("tenant_service_contracts");
      expect(body).toContain("paid_onboarding");
      expect(body).toContain("platform_service_trial_lock_verified_enterprise_identity");
    }
    const identityHelper = functionBody(
      migration.text,
      "platform_service_trial_lock_verified_enterprise_identity",
    );
    expect(identityHelper).toContain("for share of tenant, application");
    expect(identityHelper).toContain("application.status = 'approved'");
    expect(identityHelper).toContain("application.reviewed_at is not null");
    expect(identityHelper).toContain("service_trial_enterprise_identity_required");
    const review = functionBody(migration.text, "platform_service_trial_review");
    expect(review).toContain("if p_decision = 'approved' then");
    expect(review).toContain(
      "platform_service_trial_lock_verified_enterprise_identity( v_identity.tenant_id, v_identity.enterprise_identity_hash",
    );
  });

  test("normalizes effective status in each mutating command before availability checks", async () => {
    const migration = await findMigration();
    for (const name of [
      "platform_service_trial_apply", "platform_service_trial_withdraw",
      "platform_service_trial_review", "platform_service_trial_grant",
      "platform_service_trial_extend", "platform_service_trial_revoke",
      "platform_service_trial_assign",
    ]) {
      const body = functionBody(migration.text, name);
      expect(body).toContain("platform_service_trial_normalize_effective_status");
    }
    const helper = functionBody(migration.text, "platform_service_trial_normalize_effective_status");
    expect(helper).toContain("v_trial.status = 'scheduled' and p_now >= v_trial.starts_at");
    expect(helper).toContain("v_trial.status in ('scheduled', 'active') and p_now >= v_trial.trial_ends_at");
    expect(helper).toContain("p_now < v_trial.grace_ends_at");
    expect(helper).toContain("v_trial.status in ('scheduled', 'active', 'grace_period') and p_now >= v_trial.grace_ends_at");
    expect(helper).toContain("insert into public.tenant_service_trial_events");
    expect(helper).toContain("on conflict (trial_id, event_key) do nothing");
    expect(helper.indexOf("p_now >= v_trial.grace_ends_at")).toBeLessThan(
      helper.indexOf("p_now >= v_trial.trial_ends_at"),
    );
    for (const event of ["trial_activated", "trial_grace_started", "trial_expired"]) {
      expect(helper).toContain(`'${event}'`);
    }
  });

  test("implements scoped UUID idempotency with immutable request digests", async () => {
    const migration = await findMigration();
    for (const name of ["platform_service_trial_apply", "platform_service_trial_grant"]) {
      expect(functionBody(migration.text, name)).toContain(
        "v_scope_key text := 'tenant:' || p_tenant_id::text",
      );
    }
    expect(functionBody(migration.text, "platform_service_trial_withdraw")).toContain(
      "v_scope_key text := 'tenant:' || p_tenant_id::text",
    );
    for (const name of [
      "platform_service_trial_review", "platform_service_trial_extend",
      "platform_service_trial_revoke", "platform_service_trial_assign",
    ]) {
      const body = functionBody(migration.text, name);
      expect(body).toContain("v_scope_key := 'tenant:' || v_identity.tenant_id::text");
      expect(body).not.toContain("'trial:' || p_trial_id::text");
    }
    expect(functionBody(migration.text, "platform_service_trial_update_policy")).toContain(
      "v_scope_key text := 'platform:service_trial_policy'",
    );
    for (const name of [
      "platform_service_trial_apply", "platform_service_trial_withdraw",
      "platform_service_trial_review", "platform_service_trial_grant",
      "platform_service_trial_extend", "platform_service_trial_revoke",
      "platform_service_trial_assign", "platform_service_trial_update_policy",
    ]) {
      const body = functionBody(migration.text, name);
      expect(body).toContain("platform_service_trial_replay_command");
      expect(body).toContain("platform_service_trial_store_command");
      expect(body.match(/platform_service_trial_replay_command/g)?.length)
        .toBeGreaterThanOrEqual(2);
      if (name !== "platform_service_trial_update_policy") {
        expect(body.indexOf("platform_service_trial_replay_command")).toBeLessThan(
          body.indexOf("platform_service_trial_normalize_effective_status"),
        );
      }
    }
    const replay = functionBody(migration.text, "platform_service_trial_replay_command");
    expect(replay).toContain("scope_key = p_scope_key");
    expect(replay).toContain("idempotency_key = p_idempotency_key");
    expect(replay).toContain("request_hash is distinct from p_request_hash");
    expect(replay).toContain("expires_at > clock_timestamp()");
    expect(replay).toContain("service_trial_idempotency_conflict");
    expect(functionBody(migration.text, "platform_service_trial_store_command"))
      .toContain("delete from public.tenant_service_trial_commands");
  });

  test("validates the current actor before every idempotent replay", async () => {
    const migration = await findMigration();
    const tenantCommands = [
      "platform_service_trial_apply", "platform_service_trial_withdraw",
    ];
    const platformCommands = [
      "platform_service_trial_review", "platform_service_trial_grant",
      "platform_service_trial_extend", "platform_service_trial_revoke",
      "platform_service_trial_assign", "platform_service_trial_update_policy",
    ];
    for (const name of tenantCommands) {
      const body = functionBody(migration.text, name);
      const actorLock = body.indexOf("platform_service_trial_lock_tenant_actor");
      const replay = body.indexOf("platform_service_trial_replay_command");
      expect(actorLock).toBeGreaterThan(-1);
      expect(actorLock).toBeLessThan(replay);
    }
    for (const name of platformCommands) {
      const body = functionBody(migration.text, name);
      const actorLock = body.indexOf("platform_service_trial_lock_platform_actor");
      const replay = body.indexOf("platform_service_trial_replay_command");
      expect(actorLock).toBeGreaterThan(-1);
      expect(actorLock).toBeLessThan(replay);
    }
  });

  test("enforces expected versions and approved state transitions", async () => {
    const migration = await findMigration();
    for (const name of [
      "platform_service_trial_withdraw", "platform_service_trial_review",
      "platform_service_trial_extend", "platform_service_trial_revoke",
      "platform_service_trial_assign", "platform_service_trial_update_policy",
    ]) expect(functionBody(migration.text, name)).toContain("service_trial_version_conflict");
    const review = functionBody(migration.text, "platform_service_trial_review");
    expect(review).toContain("p_decision not in ('approved', 'rejected')");
    expect(review).toContain("service_trial_repeat_requires_override");
    expect(review).toContain("p_allow_override");
    expect(review).toContain("p_reason");
    const extend = functionBody(migration.text, "platform_service_trial_extend");
    expect(extend).toContain("status not in ('active', 'grace_period')");
    expect(extend).toContain("greatest(v_now, v_trial.trial_ends_at)");
    expect(extend).toContain("service_trial_extension_invalid");
    expect(extend).toContain("v_from_status := v_trial.status");
    expect(extend).toContain("'trial_extended', v_from_status, 'active'");
    expect(extend).not.toContain("status = 'expired'");
    expect(functionBody(migration.text, "platform_service_trial_revoke")).toContain("nullif(btrim(p_reason), '') is null");
    expect(functionBody(migration.text, "platform_service_trial_assign"))
      .not.toContain("p_assignee_employee_id is null then raise");
    const apply = functionBody(migration.text, "platform_service_trial_apply");
    expect(apply).toContain("granted_at is not null or converted_order_id is not null");
  });

  test("exposes exact service-role RPC contracts and hides private helpers", async () => {
    const migration = await findMigration();
    const sql = migration.text;
    const contracts = [
      ["platform_service_trial_apply", "uuid, uuid, text, integer, integer, text, text, uuid"],
      ["platform_service_trial_withdraw", "uuid, uuid, uuid, integer, text, uuid"],
      ["platform_service_trial_review", "uuid, uuid, text, integer, uuid, text, text, jsonb, integer, integer, timestamptz, uuid, boolean"],
      ["platform_service_trial_grant", "uuid, uuid, text, jsonb, text, uuid, integer, integer, timestamptz, uuid, boolean"],
      ["platform_service_trial_extend", "uuid, uuid, integer, uuid, integer, text, boolean"],
      ["platform_service_trial_revoke", "uuid, uuid, integer, uuid, text"],
      ["platform_service_trial_assign", "uuid, uuid, integer, uuid, uuid"],
      ["platform_service_trial_update_policy", "uuid, integer, uuid, jsonb, text"],
      ["platform_service_trial_platform_summary", "timestamptz"],
    ] as const;
    for (const [name, types] of contracts) {
      expect(functionSignature(sql, name)).toContain(`create or replace function public.${name}(`);
      expect(normalizeSql(functionDefinition(sql, name))).toContain("security definer set search_path = public, pg_temp");
      expectServiceRoleOnly(sql, aclReference(name, types));
    }
    for (const helper of [
      ["platform_service_trial_lock_tenant_actor", "uuid, uuid, text[]"],
      ["platform_service_trial_lock_platform_actor", "uuid, text[]"],
      ["platform_service_trial_lock_verified_enterprise_identity", "uuid, bytea"],
      ["platform_service_trial_normalize_effective_status", "uuid, uuid, timestamptz"],
      ["platform_service_trial_replay_command", "text, uuid, bytea"],
      ["platform_service_trial_store_command", "text, uuid, bytea, uuid, uuid, uuid, jsonb"],
    ] as const) {
      for (const role of ["public", "anon", "authenticated", "service_role"]) {
        expect(normalizeSql(sql)).toContain(
          `revoke all on function ${aclReference(helper[0], helper[1])} from ${role};`,
        );
      }
      expect(normalizeSql(sql)).not.toContain(
        `grant execute on function ${aclReference(helper[0], helper[1])}`,
      );
    }
  });

  test("computes a single-set summary with explicit cohort semantics", async () => {
    const body = functionBody((await findMigration()).text, "platform_service_trial_platform_summary");
    const expiredBoundary = body.indexOf(
      "trial.status in ('scheduled', 'active', 'grace_period') and p_now >= trial.grace_ends_at",
    );
    const activeBoundary = body.indexOf(
      "trial.status = 'scheduled' and p_now >= trial.starts_at",
    );
    expect(expiredBoundary).toBeGreaterThan(-1);
    expect(expiredBoundary).toBeLessThan(activeBoundary);
    expect(body).toContain("count(*) filter (where status = 'pending_review')");
    expect(body).toContain("count(*) filter (where effective_status = 'scheduled')");
    expect(body).toContain("count(*) filter (where effective_status in ('active', 'grace_period'))");
    expect(body).toContain("trial_ends_at >= p_now");
    expect(body).toContain("trial_ends_at < p_now + interval '7 days'");
    expect(body).toContain("source = 'tenant_application'");
    expect(body).toContain("activated_at");
    expect(body).toContain("date_trunc('month', p_now)");
    expect(body).not.toContain("execute ");
  });

  test("adds order attribution without re-adding the existing column", async () => {
    const sql = normalizeSql((await findMigration()).text);
    expect(sql).not.toMatch(/add\s+column\s+(?:if\s+not\s+exists\s+)?source_trial_id/);
    expect(sql).toContain("tenant_service_orders_source_trial_tenant_fkey");
    expect(sql).toContain("foreign key (source_trial_id, tenant_id) references public.tenant_service_trials(id, tenant_id)");
    expect(sql).toContain("create unique index tenant_service_orders_open_source_trial_unique");
    expect(sql).toContain("where source_trial_id is not null and payment_status <> 'closed'");
    const create = functionBody((await findMigration()).text, "platform_service_create_pending_order");
    expect(create).toContain("p_source_trial_id");
    expect(create).toContain("service_trial_order_source_invalid");
    expect(create).toContain("trial.tenant_id = p_tenant_id");
    expect(create).toContain("source_trial_id");
    const employeeLock = create.indexOf("from public.employees");
    const enterpriseLock = create.indexOf("service-trial-enterprise:");
    expect(employeeLock).toBeGreaterThan(-1);
    expect(employeeLock).toBeLessThan(enterpriseLock);
    expect(create).not.toContain("findcurrenttenanttrial");
  });

  test("preserves exact order creation and payment behavior while attributing conversion", async () => {
    const migration = await findMigration();
    const createSignature = functionSignature(migration.text, "platform_service_create_pending_order");
    expect(createSignature).toContain("p_required_channel text default 'platform_service'");
    expect(createSignature).toContain("p_source_trial_id uuid default null");
    const paymentSignature = functionSignature(migration.text, "platform_service_confirm_payment");
    expect(paymentSignature).toContain("p_order_id uuid, p_transaction_id text, p_paid_amount_fen bigint, p_paid_at timestamptz, p_notification_id uuid, p_metadata jsonb default '{}'::jsonb");
    const payment = functionBody(migration.text, "platform_service_confirm_payment");
    for (const oldBehavior of [
      "service_payment_transaction_mismatch", "service_payment_amount_mismatch",
      "on conflict (service_order_id) do nothing", "'access_mode', 'paid_onboarding'",
      "'idempotent', true", "'idempotent', false",
    ]) expect(payment).toContain(oldBehavior);
    expect(payment).toContain("formal_purchase_attributed");
    expect(payment).toContain("v_trial_from_status := v_trial.status");
    expect(payment).toContain("'formal_purchase_attributed', v_trial_from_status, v_trial.status");
    expect(payment).toContain("conversion_anomaly");
    expect(payment).toContain("'conversion_anomaly'");
    const paidUpdate = payment.indexOf("update public.tenant_service_orders");
    const anomaly = payment.indexOf("conversion_anomaly", paidUpdate);
    expect(paidUpdate).toBeGreaterThan(-1);
    expect(anomaly).toBeGreaterThan(paidUpdate);
    expect(payment.slice(anomaly)).not.toContain("raise exception");
    const review = functionBody(migration.text, "platform_service_trial_review");
    const grant = functionBody(migration.text, "platform_service_trial_grant");
    for (const body of [review, grant]) {
      expect(body).toContain("'trial_activated'");
      expect(body).toContain("effective:active:");
    }
  });

  test("seeds only approved role mappings", async () => {
    const sql = normalizeSql((await findMigration()).text);
    for (const permission of [
      "billing.service_trial.apply", "billing.service_trial.read",
      "platform.service_trial.read", "platform.service_trial.review",
      "platform.service_trial.manage", "platform.service_trial.override",
    ]) expect(sql).toContain(permission);
    expect(sql).toContain("roles.code = 'system_admin'");
    expect(sql).toContain("roles.tenant_id is not null");
    expect(sql).toContain("roles.code = 'platform_admin'");
    expect(sql).toContain("roles.code = 'platform_operations'");
    expect(sql).toContain("permission.code <> 'platform.service_trial.override'");
    expect(sql).not.toMatch(/roles\.code\s*=\s*'(?:employee_base|staff)'/);
  });

  test("forces RLS, closes table ACLs, and prevents sensitive audit snapshots", async () => {
    const migration = await findMigration();
    const sql = normalizeSql(migration.text);
    for (const table of [
      "platform_service_trial_policies", "tenant_service_trials",
      "tenant_service_trial_events", "tenant_service_trial_commands",
    ]) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`alter table public.${table} force row level security;`);
      for (const role of ["public", "anon", "authenticated"]) {
        expect(sql).toContain(`revoke all on table public.${table} from ${role};`);
      }
    }
    const eventTrigger = functionBody(migration.text, "platform_service_trial_protect_event");
    expect(eventTrigger).toContain("raise exception 'service_trial_event_immutable'");
    const auditWrites = Array.from(migration.text.matchAll(
      /INSERT INTO public\.tenant_service_trial_(?:events|commands)[\s\S]*?;/g,
    )).map((match) => match[0]).join("\n");
    expect(auditWrites).not.toMatch(/contact_phone|contact_name/);
    expect(sql).toContain("not (metadata ?| array['contact_name', 'contact_phone', 'phone', 'mobile'])");
    expect(sql).toContain("not (result_envelope ?| array['contact_name', 'contact_phone', 'phone', 'mobile'])");
  });
});

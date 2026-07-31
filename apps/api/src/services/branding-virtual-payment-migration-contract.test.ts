import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../supabase/migrations/20260731130000_create_branding_virtual_payment_foundation.sql",
);
const migrationSql = readFileSync(migrationPath, "utf8");
const apiContractsSource = readFileSync(
  resolve(import.meta.dir, "./branding-virtual-payment-contracts.ts"),
  "utf8",
);

function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

function extractFunction(sql: string, functionName: string): string {
  return (
    sql.match(
      new RegExp(
        `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

function extractFunctionBody(sql: string, functionName: string): string {
  return (
    extractFunction(sql, functionName).match(/\bAS\s+\$\$([\s\S]*?)\$\$;/i)?.[1] ??
    ""
  );
}

function extractTable(sql: string, tableName: string): string {
  return (
    sql.match(
      new RegExp(
        `CREATE TABLE IF NOT EXISTS public\\.${tableName}\\s*\\([\\s\\S]*?\\n\\);`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

function extractTriggerUpdateColumns(
  sql: string,
  triggerName: string,
  tableName: string,
): string[] {
  const columns =
    sql.match(
      new RegExp(
        `CREATE TRIGGER ${triggerName}\\s+BEFORE UPDATE OF([\\s\\S]*?)\\s+ON public\\.${tableName}`,
        "i",
      ),
    )?.[1] ?? "";
  return columns.split(",").map((column) => column.trim().toLowerCase());
}

describe("branding virtual payment foundation migration", () => {
  test("re-exports shared states and keeps server-only codes stable", () => {
    expect(apiContractsSource).toContain('export * from "@gooes/domain";');
    expect(apiContractsSource).toContain(
      '"BRANDING_VIRTUAL_PAYMENT_SESSION_REFRESH_REQUIRED" as const',
    );
    expect(apiContractsSource).toContain(
      '"BRANDING_ADDON_PAYMENT_CHANNEL_MIGRATED" as const',
    );
  });

  test("is transactional and documents forward-only rollback dependencies", () => {
    const normalized = normalizeSql(migrationSql);
    const rollback = normalizeSql(
      migrationSql.slice(0, migrationSql.indexOf("BEGIN;")),
    );

    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(normalized).toMatch(/\bbegin;[\s\S]*commit;$/);
    for (const dependency of [
      "branding_create_virtual_addon_order",
      "tr_tenant_virtual_addon_orders_entitlement_event",
      "tr_tenant_virtual_addon_orders_state_transition",
      "tr_tenant_virtual_addon_orders_snapshot_immutable",
      "tr_platform_addon_products_purchase_mode",
      "platform_virtual_payment_products",
      "tenant_virtual_addon_orders",
      "purchase_mode",
    ]) {
      expect(rollback).toContain(dependency);
    }
    expect(rollback).toContain("forward migration");
    expect(rollback).toContain("tenant_addon_orders remains untouched");
  });

  test("adds the irreversible branding purchase-mode state machine", () => {
    const normalized = normalizeSql(migrationSql);
    const guard = normalizeSql(
      extractFunction(
        migrationSql,
        "guard_branding_addon_purchase_mode_transition",
      ),
    );

    expect(normalized).toContain(
      "add column purchase_mode text not null default 'direct_legacy'",
    );
    expect(normalized).toContain(
      "check (purchase_mode in ('direct_legacy', 'maintenance', 'wechat_virtual'))",
    );
    expect(guard).toContain("returns trigger language plpgsql");
    expect(guard).toContain("set search_path = public, pg_temp");
    for (const transition of [
      "old.purchase_mode = new.purchase_mode",
      "old.purchase_mode = 'direct_legacy' and new.purchase_mode = 'maintenance'",
      "old.purchase_mode = 'maintenance' and new.purchase_mode = 'wechat_virtual'",
      "old.purchase_mode = 'wechat_virtual' and new.purchase_mode = 'maintenance'",
    ]) {
      expect(guard).toContain(transition);
    }
    expect(guard).not.toContain(
      "old.purchase_mode = 'wechat_virtual' and new.purchase_mode = 'direct_legacy'",
    );
    expect(guard).toContain("errcode = 'p0001'");
    expect(guard).toContain(
      "message = 'branding_addon_purchase_mode_transition_invalid'",
    );
    expect(normalized).toContain(
      "create trigger tr_platform_addon_products_purchase_mode before update of purchase_mode on public.platform_addon_products",
    );
  });

  test("creates a constrained private virtual product mapping", () => {
    const table = normalizeSql(
      extractTable(migrationSql, "platform_virtual_payment_products"),
    );

    expect(table).not.toBe("");
    for (const contract of [
      "id uuid primary key default gen_random_uuid()",
      "addon_product_id uuid not null",
      "references public.platform_addon_products(id) on delete restrict",
      "provider text not null default 'wechat_virtual'",
      "check (provider = 'wechat_virtual')",
      "check (environment in ('sandbox', 'production'))",
      "app_id text not null",
      "virtual_merchant_id text not null",
      "offer_id text not null",
      "provider_product_id text not null",
      "goods_quantity integer not null default 1",
      "check (goods_quantity = 1)",
      "check (expected_amount_fen > 0)",
      "check (environment <> 'production' or expected_amount_fen >= 100)",
      "encrypted_secret_ref text not null",
      "check (secret_revision > 0)",
      "check (status in ('draft', 'active', 'disabled'))",
      "check (validation_status in ('pending', 'valid', 'invalid'))",
      "validated_at timestamptz null",
      "check (version > 0)",
      "created_by uuid null references public.employees(id) on delete set null",
      "updated_by uuid null references public.employees(id) on delete set null",
      "unique (addon_product_id, environment)",
      "unique (offer_id, provider_product_id, environment)",
    ]) {
      expect(table).toContain(contract);
    }
    expect(normalizeSql(migrationSql)).toContain(
      "create trigger tr_platform_virtual_payment_products_updated_at before update on public.platform_virtual_payment_products for each row execute function public.update_updated_at_column()",
    );
  });

  test("creates tenant-isolated virtual order facts and paid-state invariants", () => {
    const table = normalizeSql(
      extractTable(migrationSql, "tenant_virtual_addon_orders"),
    );

    expect(table).not.toBe("");
    for (const contract of [
      "tenant_id uuid not null references public.tenants(id) on delete restrict",
      "order_no text not null unique",
      "out_trade_no text not null unique",
      "constraint tenant_virtual_addon_orders_tenant_idempotency_key unique (tenant_id, idempotency_key)",
      "constraint tenant_virtual_addon_orders_identity_key unique (id, tenant_id)",
      "foreign key (product_id, product_code) references public.platform_addon_products(id, code) on delete restrict",
      "entitlement_code text not null",
      "product_name text not null",
      "check (amount_fen >= 100)",
      "check (term_years = 1)",
      "check (environment in ('sandbox', 'production'))",
      "check (requested_platform in ('android', 'harmony', 'windows', 'ios', 'unknown'))",
      "check (settlement_channel in ('wechat', 'apple'))",
      "payer_openid text not null",
      "provider_order_no text null unique",
      "transaction_id text null unique",
      "check (payment_status in ('pending', 'succeeded', 'closed', 'failed'))",
      "check (fulfillment_status in ('pending', 'granted', 'grant_failed'))",
      "check (refund_status in ('none', 'reviewing', 'submitted', 'external_required', 'succeeded', 'failed', 'rejected'))",
      "check (payment_status <> 'succeeded' or (paid_amount_fen = amount_fen and paid_at is not null))",
      "check (fulfillment_status <> 'granted' or entitlement_event_id is not null)",
      "foreign key (entitlement_event_id, tenant_id, entitlement_code) references public.tenant_entitlement_events(id, tenant_id, entitlement_code) on delete restrict",
      "check (config_version > 0)",
      "check (secret_revision > 0)",
      "reconcile_claim_token uuid null",
      "reconcile_claim_expires_at timestamptz null",
      "check (reconcile_attempt_count >= 0)",
      "created_by uuid not null references public.employees(id) on delete restrict",
    ]) {
      expect(table).toContain(contract);
    }
    for (const boundedField of [
      "order_no",
      "out_trade_no",
      "product_name",
      "purchase_notes",
      "refund_policy",
      "offer_id",
      "provider_product_id",
      "payer_openid",
      "provider_order_no",
      "transaction_id",
      "failure_code",
      "failure_message",
      "reconcile_last_error",
    ]) {
      expect(table).toContain(`char_length(${boundedField}) <=`);
    }
  });

  test("adds bounded pending, list, reconciliation, and keyword indexes", () => {
    const normalized = normalizeSql(migrationSql);
    for (const index of [
      "create unique index tenant_virtual_addon_orders_pending_product_unique_idx on public.tenant_virtual_addon_orders(tenant_id, product_code) where payment_status = 'pending'",
      "create unique index tenant_virtual_addon_orders_entitlement_event_unique_idx on public.tenant_virtual_addon_orders(entitlement_event_id) where entitlement_event_id is not null",
      "create index tenant_virtual_addon_orders_tenant_status_created_idx on public.tenant_virtual_addon_orders(tenant_id, payment_status, created_at desc, id desc)",
      "create index tenant_virtual_addon_orders_tenant_created_idx on public.tenant_virtual_addon_orders(tenant_id, created_at desc, id desc)",
      "create index tenant_virtual_addon_orders_platform_created_idx on public.tenant_virtual_addon_orders(created_at desc, id desc)",
      "create index tenant_virtual_addon_orders_status_created_idx on public.tenant_virtual_addon_orders(payment_status, created_at desc, id desc)",
      "create index tenant_virtual_addon_orders_reconcile_idx on public.tenant_virtual_addon_orders(payment_status, fulfillment_status, payment_expires_at, id) where payment_status = 'pending' or fulfillment_status = 'grant_failed'",
      "create index tenant_virtual_addon_orders_reconcile_claim_idx on public.tenant_virtual_addon_orders(reconcile_claim_expires_at asc, payment_expires_at asc, id) where payment_status = 'pending' or fulfillment_status = 'grant_failed'",
      "using gin (order_no extensions.gin_trgm_ops)",
      "using gin (out_trade_no extensions.gin_trgm_ops)",
    ]) {
      expect(normalized).toContain(index);
    }
  });

  test("creates orders atomically from locked server-owned snapshots", () => {
    const command = normalizeSql(
      extractFunction(migrationSql, "branding_create_virtual_addon_order"),
    );

    expect(command).not.toBe("");
    expect(command).toContain("security definer");
    expect(command).toContain("set search_path = public, pg_temp");
    expect(command).toContain(
      "from public.platform_addon_products as addon_product where addon_product.code = 'custom_support_branding_annual' for share",
    );
    expect(command).toContain(
      "from public.platform_virtual_payment_products as virtual_product",
    );
    expect(command).toContain("virtual_product.status = 'active'");
    expect(command).toContain("virtual_product.validation_status = 'valid'");
    expect(command).toMatch(
      /from public\.platform_virtual_payment_products as virtual_product[\s\S]*?for share/,
    );
    for (const contract of [
      "v_product.purchase_mode <> 'wechat_virtual'",
      "v_product.enabled = false",
      "v_virtual_product.expected_amount_fen is distinct from v_product.amount_fen",
      "v_virtual_product.environment = 'production' and v_product.amount_fen < 100",
      "where orders.tenant_id = p_tenant_id and orders.idempotency_key = p_idempotency_key",
      "where orders.tenant_id = p_tenant_id and orders.product_code = v_product.code and orders.payment_status = 'pending'",
      "on conflict do nothing",
      "returning tenant_virtual_addon_orders.* into v_order",
      "v_product.name",
      "v_product.amount_fen",
      "v_product.purchase_notes",
      "v_product.refund_policy",
      "v_virtual_product.environment",
      "v_virtual_product.offer_id",
      "v_virtual_product.provider_product_id",
      "v_virtual_product.version",
      "v_virtual_product.secret_revision",
    ]) {
      expect(command).toContain(contract);
    }
    expect(command).toMatch(/'bvo-' \|\| to_char\([\s\S]*?'yyyymmddhh24missms'/);
    expect(command).toMatch(/'bv' \|\| to_char\([\s\S]*?'yyyymmddhh24miss'/);
    expect(command).not.toMatch(/p_(?:amount|offer|provider_product|environment|product_code|product_name|purchase_notes|refund_policy)/);
    for (const stableCode of [
      "BRANDING_VIRTUAL_ORDER_INPUT_INVALID",
      "BRANDING_VIRTUAL_PRODUCT_NOT_FOUND",
      "BRANDING_VIRTUAL_PURCHASE_MODE_UNAVAILABLE",
      "BRANDING_VIRTUAL_PRODUCT_DISABLED",
      "BRANDING_VIRTUAL_PRODUCT_MAPPING_UNAVAILABLE",
      "BRANDING_VIRTUAL_PRODUCT_AMOUNT_MISMATCH",
      "BRANDING_VIRTUAL_PRODUCT_AMOUNT_TOO_LOW",
      "BRANDING_VIRTUAL_ORDER_CONFLICT",
    ]) {
      expect(command).toContain(stableCode.toLowerCase());
    }
    const normalized = normalizeSql(migrationSql);
    for (const role of ["public", "anon", "authenticated"]) {
      expect(normalized).toContain(
        `revoke all on function public.branding_create_virtual_addon_order(uuid, uuid, uuid, text, text, uuid) from ${role}`,
      );
    }
    expect(normalized).toContain(
      "grant execute on function public.branding_create_virtual_addon_order(uuid, uuid, uuid, text, text, uuid) to service_role",
    );
  });

  test("protects immutable snapshots and approved forward-only state transitions", () => {
    const snapshotGuard = normalizeSql(
      extractFunctionBody(
        migrationSql,
        "guard_tenant_virtual_addon_order_snapshot",
      ),
    );
    const triggerColumns = extractTriggerUpdateColumns(
      migrationSql,
      "tr_tenant_virtual_addon_orders_snapshot_immutable",
      "tenant_virtual_addon_orders",
    );
    const immutableFields = [
      "tenant_id",
      "order_no",
      "out_trade_no",
      "idempotency_key",
      "product_id",
      "product_code",
      "entitlement_code",
      "product_name",
      "amount_fen",
      "term_years",
      "purchase_notes",
      "refund_policy",
      "environment",
      "offer_id",
      "provider_product_id",
      "requested_platform",
      "payer_openid",
      "config_version",
      "secret_revision",
      "payment_expires_at",
      "created_by",
      "created_at",
    ];
    for (const field of immutableFields) {
      expect(snapshotGuard).toContain(`old.${field}`);
      expect(snapshotGuard).toContain(`new.${field}`);
      expect(triggerColumns).toContain(field);
    }
    expect(snapshotGuard).toContain(
      "branding_virtual_order_snapshot_immutable",
    );

    const stateGuard = normalizeSql(
      extractFunctionBody(
        migrationSql,
        "guard_tenant_virtual_addon_order_state_transition",
      ),
    );
    for (const transition of [
      "old.payment_status = 'pending' and new.payment_status in ('succeeded', 'closed', 'failed')",
      "old.fulfillment_status = 'pending' and new.fulfillment_status in ('granted', 'grant_failed')",
      "old.fulfillment_status = 'grant_failed' and new.fulfillment_status = 'granted'",
      "old.refund_status = 'none' and new.refund_status = 'reviewing'",
      "old.refund_status = 'reviewing' and new.refund_status in ('submitted', 'external_required', 'rejected')",
      "old.refund_status = 'submitted' and new.refund_status in ('succeeded', 'failed')",
      "old.refund_status = 'external_required' and new.refund_status in ('succeeded', 'failed')",
    ]) {
      expect(stateGuard).toContain(transition);
    }
    for (const stableCode of [
      "BRANDING_VIRTUAL_PAYMENT_STATUS_TRANSITION_INVALID",
      "BRANDING_VIRTUAL_FULFILLMENT_STATUS_TRANSITION_INVALID",
      "BRANDING_VIRTUAL_REFUND_STATUS_TRANSITION_INVALID",
    ]) {
      expect(stateGuard).toContain(stableCode.toLowerCase());
    }
  });

  test("validates linked entitlement identity with a deferred constraint trigger", () => {
    const normalized = normalizeSql(migrationSql);
    const guard = normalizeSql(
      extractFunction(
        migrationSql,
        "guard_tenant_virtual_addon_order_entitlement_event",
      ),
    );

    for (const predicate of [
      "entitlement_event.id = new.entitlement_event_id",
      "entitlement_event.tenant_id = new.tenant_id",
      "entitlement_event.entitlement_code = new.entitlement_code",
      "entitlement_event.source_type = 'purchase'",
      "entitlement_event.source_id = new.id",
    ]) {
      expect(guard).toContain(predicate);
    }
    expect(guard).toContain("branding_virtual_entitlement_event_mismatch");
    expect(normalized).toContain(
      "create constraint trigger tr_tenant_virtual_addon_orders_entitlement_event after insert or update on public.tenant_virtual_addon_orders deferrable initially immediate for each row execute function public.guard_tenant_virtual_addon_order_entitlement_event()",
    );
  });

  test("forces RLS and grants only the required service-role table operations", () => {
    const normalized = normalizeSql(migrationSql);

    for (const table of [
      "platform_virtual_payment_products",
      "tenant_virtual_addon_orders",
    ]) {
      expect(normalized).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(normalized).toContain(
        `alter table public.${table} force row level security`,
      );
      expect(normalized).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      );
      expect(normalized).toContain(
        `revoke all on table public.${table} from service_role`,
      );
      expect(normalized).toContain(
        `grant select, insert, update on table public.${table} to service_role`,
      );
    }
    expect(normalized).not.toMatch(/create policy[\s\S]*(?:anon|authenticated)/);
  });

  test("documents private facts without rewriting ordinary add-on orders", () => {
    const normalized = normalizeSql(migrationSql);

    expect(normalized).toContain(
      "comment on table public.platform_virtual_payment_products",
    );
    expect(normalized).toContain(
      "comment on table public.tenant_virtual_addon_orders",
    );
    expect(normalized).toContain(
      "comment on function public.branding_create_virtual_addon_order(uuid, uuid, uuid, text, text, uuid)",
    );
    expect(normalized).toContain(
      "ordinary tenant_addon_orders remains untouched",
    );
    expect(normalized).not.toMatch(
      /(?:alter|update|delete from|insert into) public\.tenant_addon_orders/,
    );
  });
});

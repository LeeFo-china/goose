import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
const migrationPath = new URL(
  "../../../../supabase/migrations/20260728120000_create_branding_addon_commerce.sql",
  import.meta.url,
);
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
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
  return extractFunction(sql, functionName).match(/\bAS\s+\$\$([\s\S]*?)\$\$;/i)?.[1] ?? "";
}
function extractTriggerUpdateColumns(sql: string, triggerName: string): string[] {
  const pattern = new RegExp(
    `CREATE TRIGGER ${triggerName}\\s+BEFORE UPDATE OF([\\s\\S]*?)\\s+ON public\\.tenant_addon_orders`,
    "i",
  );
  const columns = sql.match(pattern)?.[1] ?? "";
  return columns.split(",").map((column) => column.trim().toLowerCase());
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
function extractConstraint(tableSql: string, constraintName: string): string {
  const normalized = normalizeSql(tableSql);
  const start = normalized.indexOf(`constraint ${constraintName} `);
  if (start < 0) return "";
  const end = normalized.indexOf(" constraint ", start + 1);
  return normalized.slice(start, end < 0 ? undefined : end);
}
const IMMUTABLE_ORDER_FIELDS = [
  "tenant_id", "order_no", "out_trade_no", "idempotency_key", "product_id", "product_code",
  "entitlement_code", "product_name", "amount_fen", "term_years", "purchase_notes",
  "refund_policy", "channel", "payer_openid", "payment_config_id", "expected_guard_version",
  "payment_mchid", "payment_appid", "payment_expires_at", "created_by", "created_at",
] as const;
const MUTABLE_ORDER_FIELDS = [
  "status", "prepay_id", "transaction_id", "paid_amount_fen", "paid_at", "closed_at",
  "failure_code", "failure_message", "entitlement_event_id", "close_claim_token",
  "close_claim_expires_at", "close_last_error", "close_attempt_count", "metadata", "updated_at",
] as const;
function expectImmutableOrderSnapshotContract(sql: string): void {
  const name = "guard_tenant_addon_order_snapshot";
  const guardDefinition = normalizeSql(extractFunction(sql, name));
  const guardBody = normalizeSql(extractFunctionBody(sql, name));
  const triggerColumns = extractTriggerUpdateColumns(sql, "tr_tenant_addon_orders_snapshot_immutable");
  expect(guardDefinition).toContain("returns trigger");
  expect(guardDefinition).toContain("set search_path = public, pg_temp");
  expect(guardBody).toContain("branding_addon_order_snapshot_immutable");
  expect(guardBody).toMatch(/return new; end;$/);
  for (const field of IMMUTABLE_ORDER_FIELDS) {
    expect(guardBody).toContain(`old.${field}`);
    expect(guardBody).toContain(`new.${field}`);
  }
  expect([...triggerColumns].sort()).toEqual([...IMMUTABLE_ORDER_FIELDS].sort());
  for (const field of MUTABLE_ORDER_FIELDS) {
    expect(triggerColumns).not.toContain(field);
    expect(guardBody).not.toMatch(new RegExp(`(?:old|new)\\.${field}`));
  }
}
function expectNaturalYearTermContract(sql: string): void {
  const commandBody = normalizeSql(extractFunctionBody(sql, "branding_confirm_addon_purchase"));
  expect(commandBody).toMatch(
    /values \(v_order\.tenant_id,[\s\S]*?'active', p_paid_at, p_paid_at \+ make_interval\(years => v_order\.term_years\)/,
  );
  const renewalConditional = commandBody.match(
    /if v_entitlement\.status in \('suspended', 'revoked'\) then[\s\S]*?end if;/,
  )?.[0] ?? "";
  const riskBranch = renewalConditional.match(
    /^if v_entitlement\.status in \('suspended', 'revoked'\) then[\s\S]*?elsif/,
  )?.[0] ?? "";
  expect(riskBranch).toContain("status = v_entitlement.status");
  expect(riskBranch).toContain("starts_at = v_entitlement.starts_at");
  expect(riskBranch).toContain(
    "expires_at = greatest(v_entitlement.expires_at, p_paid_at) + make_interval(years => v_order.term_years)",
  );
  const activeBranch = renewalConditional.match(
    /elsif v_entitlement\.status = 'active' and v_entitlement\.expires_at > p_paid_at then[\s\S]*?\belse\b/,
  )?.[0] ?? "";
  expect(activeBranch).toMatch(
    /^elsif v_entitlement\.status = 'active' and v_entitlement\.expires_at > p_paid_at then/,
  );
  expect(activeBranch).toContain(
    "expires_at = v_entitlement.expires_at + make_interval(years => v_order.term_years)",
  );
  expect(activeBranch).not.toContain("starts_at =");
  const expiredBranch = renewalConditional.match(
    /\belse update public\.tenant_entitlements set status = 'active'[\s\S]*?end if;$/,
  )?.[0] ?? "";
  expect(expiredBranch).toContain("starts_at = p_paid_at");
  expect(expiredBranch).toContain(
    "expires_at = p_paid_at + make_interval(years => v_order.term_years)",
  );
}
function expectPaymentRotationGuardContract(sql: string): void {
  const contracts = [
    ["guard_pending_recharge_payment_config", "orders", "addon_order.payment_config_id = old.id"],
    ["guard_pending_recharge_payment_secret", "recharge_order", "addon_order.payment_config_id = v_config_id"],
  ] as const;
  for (const [name, creditAlias, addonBinding] of contracts) {
    const guard = normalizeSql(extractFunction(sql, name));
    expect(guard).toContain("returns trigger language plpgsql security definer set search_path = public");
    expect(guard).toContain(`from public.tenant_credit_orders as ${creditAlias}`);
    expect(guard).toContain(`${creditAlias}.channel = 'wechat_pay'`);
    expect(guard).toContain(`${creditAlias}.status = 'pending'`);
    expect(guard).toContain("from public.tenant_payment_configs");
    expect(guard).toContain("join public.wechat_payment_orders");
    expect(guard).toContain("project_order.status = 'pending'");
    expect(guard).toContain("from public.tenant_addon_orders as addon_order");
    expect(guard).toContain(addonBinding);
    expect(guard).toContain("addon_order.channel = 'wechat_pay'");
    expect(guard).toContain("addon_order.status = 'pending'");
    expect(guard).toContain("platform_payment_config_pending_recharge_orders");
    expect(guard).toContain("recharge_guard_version");
    expect(guard).toContain("return new");
  }
}
function expectServiceRoleOnly(functionName: string, signature: string): void {
  const normalized = normalizeSql(migrationSql);
  const qualifiedFunction = `public.${functionName}(${signature})`;
  for (const role of ["public", "anon", "authenticated"]) {
    expect(normalized).toContain(
      `revoke all on function ${qualifiedFunction} from ${role}`,
    );
  }
  expect(normalized).toContain(
    `grant execute on function ${qualifiedFunction} to service_role`,
  );
}
describe("branding add-on commerce migration contract", () => {
  test("is transactional and documents forward rollback dependencies", () => {
    const rollback = normalizeSql(migrationSql.slice(0, migrationSql.indexOf("BEGIN;")));
    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(normalizeSql(migrationSql)).toMatch(/\bbegin;[\s\S]*commit;$/);
    for (const dependency of [
      "guard_pending_recharge_payment_config", "guard_pending_recharge_payment_secret",
      "guard_tenant_addon_order_snapshot", "tr_tenant_addon_orders_snapshot_immutable",
      "tenant_entitlement_events_purchase_source_unique_idx",
      "tenant_addon_orders_entitlement_event_identity_fkey",
      "tenant_entitlement_events_identity_key", "guard_tenant_addon_order_entitlement_event",
    ]) expect(rollback).toContain(dependency);
    expect(rollback.indexOf("restore guard_pending_recharge_payment_config"))
      .toBeLessThan(rollback.indexOf("dropping the tenant_addon_orders table"));
    expect(rollback.indexOf("tenant_addon_orders_entitlement_event_identity_fkey"))
      .toBeLessThan(rollback.indexOf("tenant_entitlement_events_identity_key"));
  });
  test("creates only the product, order, and notification tables", () => {
    expect(
      [
        ...migrationSql.matchAll(
          /CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)\s*\(/gi,
        ),
      ].map((match) => match[1]),
    ).toEqual([
      "platform_addon_products",
      "tenant_addon_orders",
      "tenant_addon_wechat_notifications",
    ]);
  });
  test("locks product identity, annual terms, and unconfigured disabled seed", () => {
    const normalized = normalizeSql(migrationSql);
    for (const contract of [
      "code text not null unique", "amount_fen integer null",
      "check (amount_fen is null or amount_fen > 0)",
      "check (enabled = false or amount_fen is not null)",
      "check (term_years = 1)", "check (version > 0)",
      "constraint platform_addon_products_identity_key unique (id, code)",
      "create trigger tr_platform_addon_products_updated_at before update on public.platform_addon_products for each row execute function public.update_updated_at_column()",
    ]) expect(normalized).toContain(contract);
    const productSeed = normalizeSql(migrationSql.match(
      /INSERT INTO public\.platform_addon_products[\s\S]*?ON CONFLICT \(code\) DO NOTHING;/i,
    )?.[0] ?? "");
    expect(productSeed).toContain("'custom_support_branding_annual'");
    expect(productSeed).toContain("'custom_support_branding'");
    expect(productSeed).toMatch(
      /values \('custom_support_branding_annual', 'custom_support_branding', '[^']+', null, 1, '[^']+', '[^']+', false, 1\) on conflict \(code\) do nothing/,
    );
  });
  test("enforces tenant-scoped order idempotency, snapshots, and state consistency", () => {
    const orderTable = extractTable(migrationSql, "tenant_addon_orders");
    const normalized = normalizeSql(orderTable);
    expect(orderTable).not.toBe("");
    for (const column of [
      "tenant_id uuid not null",
      "idempotency_key uuid not null",
      "product_id uuid not null",
      "product_code text not null",
      "entitlement_code text not null",
      "product_name text not null",
      "amount_fen integer not null",
      "term_years integer not null",
      "payment_mchid text not null",
      "payment_appid text not null",
      "expected_guard_version bigint not null",
      "payment_expires_at timestamptz not null",
      "close_claim_token uuid null",
      "close_claim_expires_at timestamptz null",
      "close_attempt_count integer not null",
      "close_last_error text null",
      "metadata jsonb not null",
    ]) {
      expect(normalized).toContain(column);
    }
    expect(normalized).toContain(
      "constraint tenant_addon_orders_tenant_idempotency_key unique (tenant_id, idempotency_key)",
    );
    expect(normalized).toContain(
      "constraint tenant_addon_orders_identity_key unique (id, tenant_id)",
    );
    expect(normalized).toContain(
      "constraint tenant_addon_orders_product_identity_fkey foreign key (product_id, product_code) references public.platform_addon_products(id, code) on delete restrict",
    );
    expect(normalized).toContain(
      "check (status in ('pending', 'paid', 'closed', 'failed'))",
    );
    expect(normalized).toContain("check (channel = 'wechat_pay')");
    expect(normalized).toContain("check (paid_amount_fen >= 0)");
    expect(normalized).toContain("check (expected_guard_version > 0)");
    expect(normalized).toContain("jsonb_typeof(metadata) = 'object'");
    const stateContracts = {
      pending: {
        required: [],
        forbidden: [
          "transaction_id", "paid_amount_fen", "paid_at", "closed_at",
          "failure_code", "failure_message", "entitlement_event_id",
        ],
      },
      paid: {
        required: [
          "transaction_id", "paid_amount_fen = amount_fen", "paid_at",
          "entitlement_event_id",
        ],
        forbidden: ["closed_at", "failure_code", "failure_message"],
      },
      closed: {
        required: ["closed_at"],
        forbidden: [
          "transaction_id", "paid_amount_fen", "paid_at", "failure_code",
          "failure_message", "entitlement_event_id",
        ],
      },
      failed: {
        required: ["failure_code", "failure_message"],
        forbidden: [
          "transaction_id", "paid_amount_fen", "paid_at", "closed_at",
          "entitlement_event_id",
        ],
      },
    } as const;
    for (const [status, contract] of Object.entries(stateContracts)) {
      const constraint = extractConstraint(
        orderTable,
        `tenant_addon_orders_${status}_state_check`,
      );
      expect(constraint).toContain(`status <> '${status}'`);
      for (const field of contract.required) {
        expect(constraint).toContain(
          field.includes("=") ? field : `${field} is not null`,
        );
      }
      for (const field of contract.forbidden) {
        expect(constraint).toContain(`${field} is null`);
      }
    }
  });
  test("prevents service-role rewrites of immutable order snapshots",
    () => expectImmutableOrderSnapshotContract(migrationSql));
  test("mutation fixture rejects guarding a mutable field in snapshot tuples", () => {
    const mutated = migrationSql.replace(/(OLD\.created_at)(\s+\) IS DISTINCT FROM ROW\([\s\S]*?)(NEW\.created_at)(\s+\) THEN)/,
      "$1,\n    OLD.paid_amount_fen$2$3,\n    NEW.paid_amount_fen$4");
    expect(() => expectImmutableOrderSnapshotContract(mutated)).toThrow();
  });
  test("adds bounded order uniqueness and list plus close-worker indexes", () => {
    const normalized = normalizeSql(migrationSql);
    for (const index of [
      "create unique index tenant_addon_orders_order_no_unique_idx on public.tenant_addon_orders(order_no)",
      "create unique index tenant_addon_orders_out_trade_no_unique_idx on public.tenant_addon_orders(out_trade_no)",
      "create unique index tenant_addon_orders_transaction_unique_idx on public.tenant_addon_orders(transaction_id) where transaction_id is not null",
      "create unique index tenant_addon_orders_entitlement_event_unique_idx on public.tenant_addon_orders(entitlement_event_id) where entitlement_event_id is not null",
      "create unique index tenant_addon_orders_pending_product_unique_idx on public.tenant_addon_orders(tenant_id, product_code) where status = 'pending'",
      "create index tenant_addon_orders_tenant_status_created_idx on public.tenant_addon_orders(tenant_id, status, created_at desc, id desc)",
      "create index tenant_addon_orders_pending_expiry_idx on public.tenant_addon_orders(payment_expires_at asc, id) where status = 'pending'",
      "create index tenant_addon_orders_close_claim_idx on public.tenant_addon_orders(close_claim_expires_at asc, payment_expires_at asc, id) where status = 'pending'",
      "create index tenant_addon_orders_payment_config_pending_idx on public.tenant_addon_orders(payment_config_id, expected_guard_version) where status = 'pending'",
    ]) expect(normalized).toContain(index);
  });
  test("extends both payment rotation guards without changing their triggers", () => {
    expectPaymentRotationGuardContract(migrationSql);
    const normalized = normalizeSql(migrationSql);
    expect(normalized).not.toMatch(
      /(?:drop|create) trigger tr_guard_pending_recharge_payment_(?:config|secret)/,
    );
    expect(normalized.indexOf("create table if not exists public.tenant_addon_orders"))
      .toBeLessThan(normalized.indexOf("create or replace function public.guard_pending_recharge_payment_config"));
  });
  test("mutation fixture rejects payment guards without add-on checks", () => {
    const mutated = migrationSql.replace(
      /OR EXISTS \(\s*SELECT 1\s*FROM public\.tenant_addon_orders AS addon_order[\s\S]*?addon_order\.status = 'pending'\s*\)/gi,
      "",
    );
    expect(() => expectPaymentRotationGuardContract(mutated)).toThrow();
  });
  test("isolates notification tenant/order identities and processing scans", () => {
    const normalized = normalizeSql(migrationSql);
    for (const contract of [
      "notify_id text not null unique",
      "constraint tenant_addon_wechat_notifications_order_identity_fkey foreign key (order_id, tenant_id) references public.tenant_addon_orders(id, tenant_id) on delete restrict",
      "jsonb_typeof(raw_payload) = 'object'",
      "create index tenant_addon_wechat_notifications_tenant_created_idx on public.tenant_addon_wechat_notifications(tenant_id, created_at desc, id desc)",
      "create index tenant_addon_wechat_notifications_order_created_idx on public.tenant_addon_wechat_notifications(order_id, created_at desc, id desc)",
      "create index tenant_addon_wechat_notifications_unprocessed_idx on public.tenant_addon_wechat_notifications(created_at asc, id) where processed = false",
    ]) expect(normalized).toContain(contract);
  });
  test("locks purchase events to the matching tenant add-on order", () => {
    const normalized = normalizeSql(migrationSql);
    const orderTable = normalizeSql(extractTable(migrationSql, "tenant_addon_orders"));
    expect(normalized).toContain(
      "create unique index tenant_entitlement_events_purchase_source_unique_idx on public.tenant_entitlement_events(source_id) where source_type = 'purchase' and source_id is not null",
    );
    expect(normalized).toContain(
      "alter table public.tenant_entitlement_events add constraint tenant_entitlement_events_identity_key unique (id, tenant_id, entitlement_code)",
    );
    expect(orderTable).toContain(
      "constraint tenant_addon_orders_entitlement_event_identity_fkey foreign key (entitlement_event_id, tenant_id, entitlement_code) references public.tenant_entitlement_events(id, tenant_id, entitlement_code) on delete restrict",
    );
    expect(orderTable).not.toContain("references public.tenant_entitlement_events(id)");
    const guard = normalizeSql(
      extractFunction(migrationSql, "guard_tenant_addon_order_entitlement_event"),
    );
    expect(guard).toContain("returns trigger language plpgsql security definer set search_path = public");
    expect(guard).toContain("if new.entitlement_event_id is null then return new");
    for (const predicate of [
      "entitlement_event.id = new.entitlement_event_id",
      "entitlement_event.tenant_id = new.tenant_id",
      "entitlement_event.entitlement_code = new.entitlement_code",
      "entitlement_event.source_type = 'purchase'", "entitlement_event.source_id = new.id",
    ]) expect(guard).toContain(predicate);
    expect(guard).toContain("branding_addon_entitlement_event_mismatch");
    expect(guard).toMatch(/return new; end; \$\$;$/);
    expect(normalized).toContain(
      "create constraint trigger tr_tenant_addon_orders_entitlement_event after insert or update on public.tenant_addon_orders deferrable initially immediate for each row execute function public.guard_tenant_addon_order_entitlement_event()",
    );
  });
  test("seeds exactly four permissions into platform and tenant admin roles", () => {
    const permissionInsert =
      migrationSql.match(
        /INSERT INTO public\.permissions \([\s\S]*?ON CONFLICT \(code\) DO UPDATE SET[\s\S]*?status = EXCLUDED\.status;/i,
      )?.[0] ?? "";
    const permissionCodes = [
      ...permissionInsert.matchAll(/\('([^']+)'/g),
    ].map((match) => match[1]);
    expect(permissionCodes).toEqual([
      "platform.branding_product.manage",
      "platform.branding_order.read",
      "brand.entitlement.purchase",
      "brand.entitlement_order.read",
    ]);
    const normalized = normalizeSql(migrationSql);
    expect(normalized).toMatch(
      /permissions\.code in \('platform\.branding_product\.manage', 'platform\.branding_order\.read'\)[\s\S]*roles\.code = 'platform_admin' and roles\.tenant_id is null/,
    );
    expect(normalized).toMatch(
      /permissions\.code in \('brand\.entitlement\.purchase', 'brand\.entitlement_order\.read'\)[\s\S]*roles\.code = 'system_admin' and roles\.tenant_id is not null/,
    );
  });
  test("keeps all three tables private behind forced RLS", () => {
    const normalized = normalizeSql(migrationSql);
    for (const table of [
      "platform_addon_products", "tenant_addon_orders",
      "tenant_addon_wechat_notifications",
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
    }
  });
  test("confirms purchases atomically through one service-role-only RPC", () => {
    const signature =
      "uuid, text, text, integer, timestamptz, text, text, uuid, jsonb";
    const command = normalizeSql(
      extractFunction(migrationSql, "branding_confirm_addon_purchase"),
    );
    expect(command).not.toBe("");
    expect(command).toContain("security definer");
    expect(command).toContain("set search_path = public, pg_temp");
    expect(command).toMatch(
      /from public\.tenant_addon_orders as addon_order where addon_order\.id = p_order_id for update/,
    );
    expect(command).toContain(
      "perform pg_advisory_xact_lock(hashtextextended(p_transaction_id, 0))",
    );
    for (const comparison of [
      "v_order.out_trade_no is distinct from p_out_trade_no",
      "v_order.amount_fen is distinct from p_paid_amount_fen",
      "v_order.payment_mchid is distinct from p_mchid",
      "v_order.payment_appid is distinct from p_appid",
    ]) {
      expect(command).toContain(comparison);
    }
    expect(command).toContain(
      "insert into public.tenant_entitlement_events",
    );
    expect(command).toContain("insert into public.platform_audit_logs");
    expect(command).toContain("update public.tenant_addon_orders");
    expect(command).toContain(
      "make_interval(years => v_order.term_years)",
    );
    expect(command).toMatch(
      /status in \('suspended', 'revoked'\)[\s\S]*status = v_entitlement\.status/,
    );
    expect(command).toContain("'source_type', 'purchase'");
    expect(command).toContain("'idempotent', true");
    expect(command).toContain("'idempotent', false");
    expect(command).not.toMatch(
      /tenant_credit_(?:orders|accounts|ledger)/,
    );
    for (const stableToken of [
      "BRANDING_ADDON_CONFIRM_INPUT_INVALID",
      "BRANDING_ADDON_ORDER_NOT_FOUND",
      "BRANDING_ADDON_OUT_TRADE_NO_MISMATCH",
      "BRANDING_ADDON_TRANSACTION_CONFLICT",
      "BRANDING_ADDON_ORDER_STATUS_INVALID",
      "BRANDING_ADDON_CALLBACK_AMOUNT_MISMATCH",
      "BRANDING_ADDON_CALLBACK_CONTEXT_MISMATCH",
    ]) {
      expect(command).toContain(stableToken.toLowerCase());
    }
    expectServiceRoleOnly(
      "branding_confirm_addon_purchase",
      signature,
    );
  });
  test("returns the existing purchase result before any term extension", () => {
    const command = normalizeSql(
      extractFunction(migrationSql, "branding_confirm_addon_purchase"),
    );
    const idempotentReturn = command.indexOf("'idempotent', true");
    const termExtension = command.indexOf(
      "make_interval(years => v_order.term_years)",
    );
    expect(idempotentReturn).toBeGreaterThan(-1);
    expect(termExtension).toBeGreaterThan(-1);
    expect(idempotentReturn).toBeLessThan(termExtension);
    expect(command).toMatch(
      /if v_order\.status = 'paid'[\s\S]*v_order\.transaction_id is distinct from p_transaction_id[\s\S]*branding_addon_transaction_conflict[\s\S]*'idempotent', true/,
    );
  });
  test("applies natural-year terms without clearing risk-controlled starts",
    () => expectNaturalYearTermContract(migrationSql));
  test("mutation fixture rejects an active renewal without an expiry guard", () => {
    const mutated = migrationSql.replace(/\s+AND v_entitlement\.expires_at > p_paid_at/i, "");
    expect(() => expectNaturalYearTermContract(mutated)).toThrow();
  });
  test("documents the private commerce model and atomic confirmation", () => {
    const normalized = normalizeSql(migrationSql);
    for (const object of [
      "table public.platform_addon_products",
      "table public.tenant_addon_orders",
      "table public.tenant_addon_wechat_notifications",
      "function public.branding_confirm_addon_purchase",
    ]) {
      expect(normalized).toContain(`comment on ${object}`);
    }
  });
});

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
  test("is transactional, forward-reversible, and credit-billing independent", () => {
    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(normalizeSql(migrationSql)).toMatch(/\bbegin;[\s\S]*commit;$/);
    expect(migrationSql).not.toMatch(
      /tenant_credit_(?:orders|accounts|ledger)/i,
    );
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

    expect(normalized).toContain("code text not null unique");
    expect(normalized).toContain("amount_fen integer null");
    expect(normalized).toContain(
      "check (amount_fen is null or amount_fen > 0)",
    );
    expect(normalized).toContain(
      "check (enabled = false or amount_fen is not null)",
    );
    expect(normalized).toContain("check (term_years = 1)");
    expect(normalized).toContain("check (version > 0)");
    expect(normalized).toContain(
      "constraint platform_addon_products_identity_key unique (id, code)",
    );
    expect(normalized).toContain(
      "create trigger tr_platform_addon_products_updated_at before update on public.platform_addon_products for each row execute function public.update_updated_at_column()",
    );

    const productSeed =
      normalizeSql(
        migrationSql.match(
          /INSERT INTO public\.platform_addon_products[\s\S]*?ON CONFLICT \(code\) DO NOTHING;/i,
        )?.[0] ?? "",
      );
    expect(productSeed).toContain("'custom_support_branding_annual'");
    expect(productSeed).toContain("'custom_support_branding'");
    expect(productSeed).toMatch(
      /values \('custom_support_branding_annual', 'custom_support_branding', '[^']+', null, 1, '[^']+', '[^']+', false, 1\) on conflict \(code\) do nothing/,
    );
  });

  test("enforces tenant-scoped order idempotency, snapshots, and state consistency", () => {
    const normalized = normalizeSql(migrationSql);

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
    expect(normalized).toMatch(
      /status <> 'pending'[\s\S]*transaction_id is null[\s\S]*entitlement_event_id is null/,
    );
    expect(normalized).toMatch(
      /status <> 'paid'[\s\S]*transaction_id is not null[\s\S]*paid_amount_fen = amount_fen[\s\S]*entitlement_event_id is not null/,
    );
    expect(normalized).toMatch(
      /status <> 'closed'[\s\S]*closed_at is not null/,
    );
    expect(normalized).toMatch(
      /status <> 'failed'[\s\S]*failure_code is not null/,
    );
  });

  test("adds bounded order uniqueness and list plus close-worker indexes", () => {
    const normalized = normalizeSql(migrationSql);

    expect(normalized).toContain(
      "create unique index tenant_addon_orders_order_no_unique_idx on public.tenant_addon_orders(order_no)",
    );
    expect(normalized).toContain(
      "create unique index tenant_addon_orders_out_trade_no_unique_idx on public.tenant_addon_orders(out_trade_no)",
    );
    expect(normalized).toContain(
      "create unique index tenant_addon_orders_transaction_unique_idx on public.tenant_addon_orders(transaction_id) where transaction_id is not null",
    );
    expect(normalized).toContain(
      "create unique index tenant_addon_orders_entitlement_event_unique_idx on public.tenant_addon_orders(entitlement_event_id) where entitlement_event_id is not null",
    );
    expect(normalized).toContain(
      "create unique index tenant_addon_orders_pending_product_unique_idx on public.tenant_addon_orders(tenant_id, product_code) where status = 'pending'",
    );
    expect(normalized).toContain(
      "create index tenant_addon_orders_tenant_status_created_idx on public.tenant_addon_orders(tenant_id, status, created_at desc, id desc)",
    );
    expect(normalized).toContain(
      "create index tenant_addon_orders_pending_expiry_idx on public.tenant_addon_orders(payment_expires_at asc, id) where status = 'pending'",
    );
    expect(normalized).toContain(
      "create index tenant_addon_orders_close_claim_idx on public.tenant_addon_orders(close_claim_expires_at asc, payment_expires_at asc, id) where status = 'pending'",
    );
  });

  test("isolates notification tenant/order identities and processing scans", () => {
    const normalized = normalizeSql(migrationSql);

    expect(normalized).toContain("notify_id text not null unique");
    expect(normalized).toContain(
      "constraint tenant_addon_wechat_notifications_order_identity_fkey foreign key (order_id, tenant_id) references public.tenant_addon_orders(id, tenant_id) on delete restrict",
    );
    expect(normalized).toContain("jsonb_typeof(raw_payload) = 'object'");
    expect(normalized).toContain(
      "create index tenant_addon_wechat_notifications_tenant_created_idx on public.tenant_addon_wechat_notifications(tenant_id, created_at desc, id desc)",
    );
    expect(normalized).toContain(
      "create index tenant_addon_wechat_notifications_order_created_idx on public.tenant_addon_wechat_notifications(order_id, created_at desc, id desc)",
    );
    expect(normalized).toContain(
      "create index tenant_addon_wechat_notifications_unprocessed_idx on public.tenant_addon_wechat_notifications(created_at asc, id) where processed = false",
    );
  });

  test("makes purchase-source entitlement events idempotent", () => {
    expect(normalizeSql(migrationSql)).toContain(
      "create unique index tenant_entitlement_events_purchase_source_unique_idx on public.tenant_entitlement_events(source_id) where source_type = 'purchase' and source_id is not null",
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

    for (
      const table of [
        "platform_addon_products",
        "tenant_addon_orders",
        "tenant_addon_wechat_notifications",
      ]
    ) {
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

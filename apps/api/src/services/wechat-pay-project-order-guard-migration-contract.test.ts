import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../../../../supabase/migrations/20260720224000_platform_payment_secret_bundle_revision.sql",
    import.meta.url,
  ),
  "utf8",
);
const normalizedMigration = migration.replace(/\s+/g, " ").trim();

describe("service-provider project order creation migration contract", () => {
  test("advances the central guard for every runtime payment field", () => {
    const runtimeFields = [
      "provider",
      "profile_code",
      "principal_type",
      "merchant_mode",
      "merchant_id",
      "sub_merchant_id",
      "app_id",
      "sub_app_id",
      "serial_no",
      "encrypted_config_ref",
      "secret_bundle_revision",
      "notify_url",
      "enabled_channels",
      "status",
      "validation_status",
      "last_validated_at",
    ];

    for (const field of runtimeFields) {
      expect(migration).toContain(`OLD.${field}`);
      expect(migration).toContain(`NEW.${field}`);
    }
    expect(migration).toContain(
      "NEW.recharge_guard_version := OLD.recharge_guard_version + 1",
    );
  });

  test("blocks central mutation while a related tenant project order is pending", () => {
    expect(normalizedMigration).toContain(
      "CREATE INDEX IF NOT EXISTS wechat_payment_orders_pending_payment_config_idx " +
        "ON public.wechat_payment_orders(payment_config_id) " +
        "WHERE status = 'pending';",
    );
    expect(migration).toMatch(
      /FROM public\.tenant_payment_configs AS tenant_config[\s\S]*JOIN public\.wechat_payment_orders AS project_order[\s\S]*project_order\.payment_config_id = tenant_config\.id[\s\S]*tenant_config\.platform_payment_config_id = OLD\.id[\s\S]*project_order\.status = 'pending'/,
    );
    expect(migration).toContain(
      "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    );
    const secretGuard = migration.match(
      /CREATE OR REPLACE FUNCTION public\.guard_pending_recharge_payment_secret\(\)[\s\S]*?\n\$\$;/,
    )?.[0];
    expect(secretGuard).toContain(
      "tenant_config.platform_payment_config_id = v_config_id",
    );
    expect(secretGuard).toContain("project_order.status = 'pending'");
  });

  test("locks central then tenant snapshots before validating and inserting", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.wechat_pay_create_pending_service_provider_order(",
    );
    expect(migration).toMatch(
      /FROM public\.platform_payment_configs AS platform_config[\s\S]*FOR UPDATE;[\s\S]*FROM public\.tenant_payment_configs AS tenant_config[\s\S]*FOR UPDATE;[\s\S]*INSERT INTO public\.wechat_payment_orders/,
    );
    expect(normalizedMigration).toContain(
      "v_platform_config.recharge_guard_version IS DISTINCT FROM p_expected_platform_guard_version",
    );
    expect(normalizedMigration).toContain(
      "v_tenant_config.updated_at IS DISTINCT FROM p_expected_tenant_config_updated_at",
    );
  });

  test("revalidates readiness and provenance inside the transaction", () => {
    for (const fragment of [
      "v_platform_config.profile_code IS DISTINCT FROM 'tenant_service_provider'",
      "v_platform_config.merchant_mode IS DISTINCT FROM 'service_provider_sub_merchant'",
      "v_platform_config.status IS DISTINCT FROM 'active'",
      "v_platform_config.validation_status IS DISTINCT FROM 'valid'",
      "'project_payment' = ANY(v_platform_config.enabled_channels)",
      "'applyment' = ANY(v_platform_config.enabled_channels)",
      "v_tenant_config.platform_payment_config_id IS DISTINCT FROM v_platform_config.id",
      "v_tenant_config.sub_app_id IS NOT NULL",
      "jsonb_array_elements_text(v_tenant_config.enabled_channels)",
      "unnest(v_platform_config.enabled_channels)",
    ]) {
      expect(normalizedMigration).toContain(fragment);
    }

    for (const code of [
      "WECHAT_PAY_PAYMENT_CONFIG_VERSION_CHANGED",
      "WECHAT_PAY_PLATFORM_PROFILE_NOT_READY",
      "WECHAT_PAY_PLATFORM_PROFILE_MISMATCH",
    ]) {
      expect(migration).toContain(`ERRCODE = '23514'`);
      expect(migration).toContain(`MESSAGE = '${code}'`);
    }
  });

  test("exposes the guarded RPC only to service_role and preserves recharge RPC", () => {
    const signature = [
      "uuid, uuid, uuid, bigint, timestamptz, uuid, uuid, uuid, uuid, text, numeric,",
      "text, uuid, jsonb",
    ].join(" ");

    expect(normalizedMigration).toContain(
      `REVOKE ALL ON FUNCTION public.wechat_pay_create_pending_service_provider_order( ${signature} ) FROM PUBLIC;`,
    );
    expect(normalizedMigration).toContain(
      `REVOKE ALL ON FUNCTION public.wechat_pay_create_pending_service_provider_order( ${signature} ) FROM anon;`,
    );
    expect(normalizedMigration).toContain(
      `REVOKE ALL ON FUNCTION public.wechat_pay_create_pending_service_provider_order( ${signature} ) FROM authenticated;`,
    );
    expect(normalizedMigration).toContain(
      `GRANT EXECUTE ON FUNCTION public.wechat_pay_create_pending_service_provider_order( ${signature} ) TO service_role;`,
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_create_pending_wechat_recharge_order(",
    );
  });
});

class ProjectOrderSerializationModel {
  centralGuardVersion = 1;
  pendingProjectOrders = 0;

  mutateCentralConfig() {
    if (this.pendingProjectOrders > 0) return false;
    this.centralGuardVersion += 1;
    return true;
  }

  createPendingProjectOrder(expectedGuardVersion: number) {
    if (expectedGuardVersion !== this.centralGuardVersion) return false;
    this.pendingProjectOrders += 1;
    return true;
  }
}

describe("service-provider project order serialization model", () => {
  test("mutation first invalidates the create snapshot before insert", () => {
    const model = new ProjectOrderSerializationModel();
    const creatorSnapshot = model.centralGuardVersion;

    expect(model.mutateCentralConfig()).toBe(true);
    expect(model.createPendingProjectOrder(creatorSnapshot)).toBe(false);
    expect(model.pendingProjectOrders).toBe(0);
  });

  test("creation first keeps central mutation blocked while pending", () => {
    const model = new ProjectOrderSerializationModel();
    const creatorSnapshot = model.centralGuardVersion;

    expect(model.createPendingProjectOrder(creatorSnapshot)).toBe(true);
    expect(model.mutateCentralConfig()).toBe(false);
    expect(model.pendingProjectOrders).toBe(1);
  });
});

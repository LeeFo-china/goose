import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260718122500_serialize_recharge_config_creation.sql",
  ),
  "utf8",
);

describe("recharge config creation serialization migration", () => {
  test("uses one config row as the config and secret serialization point", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS recharge_guard_version");
    expect(migration).toContain("recharge_guard_version + 1");
    expect(migration).toContain("ORDER BY config.id");
    expect(migration).toContain("FOR UPDATE OF config");
    expect(migration).toContain("OLD.key");
    expect(migration).toContain("NEW.key");
  });

  test("checks version under lock before inserting a pending order", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_create_pending_wechat_recharge_order",
    );
    expect(migration).toContain("p_expected_guard_version bigint");
    expect(migration).toMatch(
      /FROM public\.platform_payment_configs AS config[\s\S]*FOR UPDATE[\s\S]*BILLING_RECHARGE_PAYMENT_CONFIG_VERSION_CHANGED[\s\S]*INSERT INTO public\.tenant_credit_orders/,
    );
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("FROM PUBLIC");
    expect(migration).toContain("FROM anon");
    expect(migration).toContain("FROM authenticated");
    expect(migration).toContain("TO service_role");
  });

  test("guards config and secret identity deletion paths", () => {
    expect(migration).toContain("BEFORE DELETE");
    expect(migration).toContain("ON public.platform_payment_configs");
    expect(migration).toContain("BEFORE UPDATE OF value_text, key, tenant_id");
    expect(migration).toContain("ON public.system_settings");
    expect(migration).toContain("BEFORE DELETE");
    expect(migration).toContain("TG_OP = 'DELETE'");
    expect(migration).toContain("OLD.tenant_id IS NULL");
  });
});

class ConfigSerializationModel {
  version = 1;
  pendingOrders = 0;

  rotateCritical() {
    if (this.pendingOrders > 0) return false;
    this.version += 1;
    return true;
  }

  createPending(expectedVersion: number) {
    if (this.version !== expectedVersion) return false;
    this.pendingOrders += 1;
    return true;
  }
}

describe("two-instance recharge config serialization model", () => {
  test("rotation first invalidates the creator CAS without creating an order", () => {
    const model = new ConfigSerializationModel();
    const creatorSnapshot = model.version;

    expect(model.rotateCritical()).toBe(true);
    expect(model.createPending(creatorSnapshot)).toBe(false);
    expect(model.pendingOrders).toBe(0);
  });

  test("creation first makes the concurrent rotation fail", () => {
    const model = new ConfigSerializationModel();
    const creatorSnapshot = model.version;

    expect(model.createPending(creatorSnapshot)).toBe(true);
    expect(model.rotateCritical()).toBe(false);
    expect(model.pendingOrders).toBe(1);
  });
});

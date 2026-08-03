import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260718122000_guard_pending_recharge_payment_config.sql",
  ),
  "utf8",
);
const platformServiceMigration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260803113000_guard_platform_service_payment_config.sql",
  ),
  "utf8",
);

describe("pending recharge payment config guard migration", () => {
  test("guards critical payment config fields for matching pending wechat orders", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_config",
    );
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("BEFORE UPDATE OF merchant_mode");
    for (const field of [
      "merchant_mode",
      "merchant_id",
      "sub_merchant_id",
      "app_id",
      "sub_app_id",
      "serial_no",
      "encrypted_config_ref",
    ]) {
      expect(migration).toContain(`OLD.${field}`);
      expect(migration).toContain(`NEW.${field}`);
    }
    expect(migration).toContain("ON public.platform_payment_configs");
    expect(migration).toContain("DROP TRIGGER IF EXISTS");
    expect(migration).toContain("orders.payment_config_id = OLD.id");
    expect(migration).toContain("orders.status = 'pending'");
    expect(migration).toContain("orders.channel = 'wechat_pay'");
    expect(migration).toContain("PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS");
    expect(migration).toContain("ERRCODE = '23514'");
    const triggerColumns = migration.match(
      /CREATE TRIGGER tr_guard_pending_recharge_payment_config\s+BEFORE UPDATE OF ([\s\S]*?)\s+ON public\.platform_payment_configs/,
    )?.[1];
    expect(triggerColumns).toBeDefined();
    expect(triggerColumns).not.toContain("status");
    expect(triggerColumns).not.toContain("enabled_channels");
  });

  test("guards referenced platform secret values across supported setting refs", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.guard_pending_recharge_payment_secret",
    );
    expect(migration).toContain("BEFORE UPDATE OF value_text");
    expect(migration).toContain("ON public.system_settings");
    expect(migration).toContain("NEW.tenant_id IS NULL");
    expect(migration).toContain("NEW.key");
    expect(migration).toContain("'secret://' || NEW.key");
    expect(migration).toContain("'setting://' || NEW.key");
    expect(migration).toContain("OLD.value_text IS DISTINCT FROM NEW.value_text");
  });

  test("indexes the bounded pending-order existence check", () => {
    expect(migration).toContain(
      "tenant_credit_orders_pending_wechat_payment_config_idx",
    );
    expect(migration).toContain("ON public.tenant_credit_orders(payment_config_id)");
  });
});

describe("pending platform payment order guard migration", () => {
  test("extends config and secret guards to platform service orders", () => {
    expect(platformServiceMigration).toContain(
      "tenant_service_orders_pending_payment_config_idx",
    );
    expect(platformServiceMigration).toContain(
      "FROM public.tenant_service_orders AS service_order",
    );
    expect(platformServiceMigration).toContain(
      "service_order.payment_config_id = OLD.id",
    );
    expect(platformServiceMigration).toContain(
      "service_order.payment_config_id = v_config_id",
    );
    expect(platformServiceMigration).toContain(
      "service_order.payment_status = 'pending'",
    );
    expect(platformServiceMigration).toContain(
      "PLATFORM_PAYMENT_CONFIG_PENDING_ORDERS",
    );
    expect(platformServiceMigration).toContain("ERRCODE = '23514'");
  });
});

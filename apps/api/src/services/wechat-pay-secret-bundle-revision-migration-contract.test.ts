import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("wechat pay secret bundle revision migration contract", () => {
  test("binds platform validation to an opaque secret bundle revision", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260720224000_platform_payment_secret_bundle_revision.sql",
        import.meta.url,
      ),
      "utf8",
    );
    const normalizedMigrationSource = migrationSource.replace(/\s+/g, " ")
      .trim();

    expect(migrationSource).toContain(
      "ADD COLUMN IF NOT EXISTS secret_bundle_revision text NULL",
    );
    expect(normalizedMigrationSource).toContain(
      "ADD CONSTRAINT platform_payment_configs_secret_bundle_revision_not_blank CHECK (secret_bundle_revision IS NULL OR btrim(secret_bundle_revision) <> '')",
    );
    expect(migrationSource).toContain(
      "COMMENT ON COLUMN public.platform_payment_configs.secret_bundle_revision",
    );
    expect(migrationSource).toContain("opaque revision");
    expect(migrationSource).toContain("never secret material");
  });

  test("serializes secret revision rotation with pending recharge creation", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260720224000_platform_payment_secret_bundle_revision.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migrationSource).toContain("OLD.secret_bundle_revision");
    expect(migrationSource).toContain("NEW.secret_bundle_revision");
    expect(migrationSource).toMatch(
      /BEFORE UPDATE OF[\s\S]*secret_bundle_revision[\s\S]*ON public\.platform_payment_configs/,
    );
    expect(migrationSource).toContain(
      "NEW.recharge_guard_version := OLD.recharge_guard_version + 1",
    );
    expect(migrationSource).toContain(
      "PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS",
    );
  });

  test("rechecks validation and revision under the order creation row lock", () => {
    const migrationSource = readFileSync(
      new URL(
        "../../../../supabase/migrations/20260720224000_platform_payment_secret_bundle_revision.sql",
        import.meta.url,
      ),
      "utf8",
    );

    expect(migrationSource).toMatch(
      /FROM public\.platform_payment_configs AS config[\s\S]*FOR UPDATE[\s\S]*v_config\.validation_status <> 'valid'[\s\S]*v_config\.secret_bundle_revision[\s\S]*INSERT INTO public\.tenant_credit_orders/,
    );
  });
});

class SecretRevisionSerializationModel {
  guardVersion = 1;
  pendingOrders = 0;

  rotateSecretRevision() {
    if (this.pendingOrders > 0) return false;
    this.guardVersion += 1;
    return true;
  }

  createPending(expectedGuardVersion: number) {
    if (expectedGuardVersion !== this.guardVersion) return false;
    this.pendingOrders += 1;
    return true;
  }
}

describe("secret revision and recharge creation serialization model", () => {
  test("rotation first invalidates the creator snapshot", () => {
    const model = new SecretRevisionSerializationModel();
    const creatorSnapshot = model.guardVersion;

    expect(model.rotateSecretRevision()).toBe(true);
    expect(model.createPending(creatorSnapshot)).toBe(false);
    expect(model.pendingOrders).toBe(0);
  });

  test("creation first blocks the concurrent rotation", () => {
    const model = new SecretRevisionSerializationModel();
    const creatorSnapshot = model.guardVersion;

    expect(model.createPending(creatorSnapshot)).toBe(true);
    expect(model.rotateSecretRevision()).toBe(false);
    expect(model.pendingOrders).toBe(1);
  });
});

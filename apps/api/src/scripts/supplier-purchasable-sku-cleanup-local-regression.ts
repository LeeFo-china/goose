/** Called only by the disposable local database runner, never by a remote CLI. */
import assert from "node:assert/strict";
import {
  cleanupSupplierPurchasableSkuSmokeFixture as cleanup,
  countSupplierPurchasableSkuSmokeResiduals as count,
  createSupplierPurchasableSkuSmokeFixture as fixtureFactory,
  seedSupplierPurchasableSkuSmokeFixture as seed,
  type SupplierPurchasableSkuSmokeFixture,
} from "./supplier-purchasable-sku-smoke-fixture";
import {
  createSupplierPurchasableSkuDatabaseOptions,
  type SupplierPurchasableSkuDatabaseConnection,
} from "./supplier-purchasable-sku-development-database";

export async function runSupplierSkuCleanupLocalRegression(
  connection: SupplierPurchasableSkuDatabaseConnection,
): Promise<void> {
  assert.equal(connection.hostname, "127.0.0.1");
  assert.equal(connection.username, "postgres");
  assert.equal(connection.password, "isolated-fixture-only");
  const sql = new Bun.SQL(createSupplierPurchasableSkuDatabaseOptions(connection, 1));
  const fixtures: SupplierPurchasableSkuSmokeFixture[] = [];
  try {
    const marker = await sql<{ present: boolean }[]>`
      select to_regclass('public.supplier_sku_cleanup_isolated_marker') is not null as present`;
    assert.equal(marker[0]?.present, true, "Requires a disposable runner-owned database");
    const normal = fixtureFactory();
    await seed(sql, normal);
    const warehouses = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.warehouses where tenant_id=${normal.tenantId}::uuid`;
    assert.equal(warehouses[0]?.count, 1, "Real settings trigger must seed one warehouse");
    await cleanup(sql, normal);
    assert.equal(await count(sql, normal), 0);
    await cleanup(sql, normal);
    assert.equal(await count(sql, normal), 0);
    console.log("PASS real seed/default warehouse -> cleanup zero; repeated cleanup zero");

    for (const scenario of ["renamed", "version-changed", "stock", "command", "other-tenant"] as const) {
      const fixture = fixtureFactory();
      fixtures.push(fixture);
      await seed(sql, fixture);
      if (scenario === "renamed") {
        await sql`update public.warehouses set name='保留仓库' where tenant_id=${fixture.tenantId}::uuid`;
      } else if (scenario === "version-changed") {
        await sql`update public.warehouses set version=2 where tenant_id=${fixture.tenantId}::uuid`;
      } else if (scenario === "stock") {
        await sql`insert into public.inventory_balances(tenant_id, warehouse_id, supplier_sku_id,
          quantity_on_hand, inventory_value, average_unit_cost)
          select tenant_id, id, ${fixture.inactiveSkuId}::uuid, 1, 10, 10
          from public.warehouses where tenant_id=${fixture.tenantId}::uuid`;
      } else {
        const tenantId = scenario === "other-tenant" ? fixture.otherTenantId : fixture.tenantId;
        const employeeId = scenario === "other-tenant" ? fixture.otherEmployeeId : fixture.actorEmployeeId;
        const userId = scenario === "other-tenant" ? fixture.otherUserId : fixture.actorUserId;
        const before = await count(sql, fixture);
        if (scenario === "other-tenant") {
          await sql`insert into public.tenant_supplier_settings(tenant_id, module_enabled,
            enabled_by_employee_id, enabled_at)
            values (${tenantId}::uuid, true, ${employeeId}::uuid, now())`;
          assert.equal(await count(sql, fixture), before + 2, "Other tenant settings and warehouse count");
        }
        const beforeCommand = await count(sql, fixture);
        await sql`insert into public.warehouse_command_events(tenant_id, warehouse_id, command,
          actor_user_id, actor_employee_id, idempotency_key, request_fingerprint, result_version)
          select tenant_id, id, 'create', ${userId}::uuid, ${employeeId}::uuid,
          ${fixture.token}, 'isolated-regression', 1 from public.warehouses where tenant_id=${tenantId}::uuid`;
        assert.equal(await count(sql, fixture), beforeCommand + 1, "Warehouse commands must count for either tenant");
      }
      const snapshot = async () => ({
        residuals: await count(sql, fixture),
        warehouses: await sql`select * from public.warehouses where tenant_id in
          (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid) order by id`,
        stock: await sql`select * from public.inventory_balances where tenant_id=${fixture.tenantId}::uuid order by id`,
        commands: await sql`select * from public.warehouse_command_events where tenant_id in
          (${fixture.tenantId}::uuid, ${fixture.otherTenantId}::uuid) order by id`,
        skus: await sql`select * from public.supplier_skus where supplier_id=${fixture.supplierId}::uuid order by id`,
      });
      const before = await snapshot();
      await assert.rejects(cleanup(sql, fixture), (error: unknown) =>
        typeof error === "object" && error !== null && "errno" in error && error.errno === "23503",
      );
      assert.deepEqual(await snapshot(), before, `${scenario} must roll back all earlier cleanup`);
      const role = await sql<{ role: string }[]>`select current_setting('session_replication_role') as role`;
      assert.equal(role[0]?.role, "origin");
      console.log(`PASS ${scenario}: FK refusal, whole cleanup rollback, facts and parents retained`);
    }

    const partial = fixtureFactory();
    await sql`insert into public.tenants(id, name, slug, status)
      values (${partial.tenantId}::uuid, ${partial.token}, ${partial.token}, 'active')`;
    assert.equal(await count(sql, partial), 1);
    await cleanup(sql, partial);
    assert.equal(await count(sql, partial), 0);
    console.log("PASS partial seed before actor/settings cleanup zero");

    const afterSettings = fixtureFactory();
    await sql.unsafe(`create function public.supplier_sku_cleanup_seed_failure() returns trigger
      language plpgsql as $$ begin raise exception 'ISOLATED_SEED_INTERRUPTED'; end $$;
      create trigger supplier_sku_cleanup_seed_failure before insert on public.supplier_products
      for each row execute function public.supplier_sku_cleanup_seed_failure();`).simple();
    await assert.rejects(seed(sql, afterSettings), /ISOLATED_SEED_INTERRUPTED/);
    await sql.unsafe(`drop trigger supplier_sku_cleanup_seed_failure on public.supplier_products;
      drop function public.supplier_sku_cleanup_seed_failure();`).simple();
    const partialWarehouses = await sql<{ count: number }[]>`
      select count(*)::integer as count from public.warehouses where tenant_id=${afterSettings.tenantId}::uuid`;
    assert.equal(partialWarehouses[0]?.count, 1);
    await cleanup(sql, afterSettings);
    assert.equal(await count(sql, afterSettings), 0);
    console.log("PASS real seed interrupted after settings/default warehouse -> cleanup zero");

    const { DirectSupplierPurchasableSkuSmokeGateway } = await import("./supplier-purchasable-sku-smoke-database");
    const gateway = new DirectSupplierPurchasableSkuSmokeGateway(connection);
    try {
      await gateway.runScenarios();
      assert.equal(await gateway.cleanup(), true);
      assert.equal(await gateway.cleanup(), true);
      console.log("PASS actual Direct gateway scenarios and independent-connection cleanup verification");
    } finally {
      await gateway.close();
    }
    assert.equal(fixtures.length, 5);
  } finally {
    await sql.close({ timeout: 5 });
  }
}

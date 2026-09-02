import type { SupplierPurchasableSkuSmokeGateway } from
  "./supplier-purchasable-sku-smoke";
import {
  SUPPLIER_PURCHASABLE_SKU_CLOSE_OPTIONS,
  createSupplierPurchasableSkuDatabaseOptions,
  type SupplierPurchasableSkuDatabaseConnection,
} from "./supplier-purchasable-sku-development-database";
import { verifySupplierPurchasableSkuBoundaries } from
  "./supplier-purchasable-sku-smoke-boundaries";
import {
  cleanupSupplierPurchasableSkuSmokeFixture,
  countSupplierPurchasableSkuSmokeResiduals,
  createSupplierPurchasableSkuSmokeFixture,
  seedSupplierPurchasableSkuSmokeFixture,
} from "./supplier-purchasable-sku-smoke-fixture";
import { runSupplierPurchasableSkuCoreScenarios } from
  "./supplier-purchasable-sku-smoke-scenarios";

export class DirectSupplierPurchasableSkuSmokeGateway
implements SupplierPurchasableSkuSmokeGateway {
  private readonly database: Bun.SQL;
  private readonly fixture = createSupplierPurchasableSkuSmokeFixture();

  constructor(
    private readonly databaseConnection: SupplierPurchasableSkuDatabaseConnection,
  ) {
    this.database = new Bun.SQL(
      createSupplierPurchasableSkuDatabaseOptions(databaseConnection, 4),
    );
  }

  async runScenarios() {
    await seedSupplierPurchasableSkuSmokeFixture(this.database, this.fixture);
    const evidence = await runSupplierPurchasableSkuCoreScenarios(
      this.database,
      this.fixture,
    );
    await verifySupplierPurchasableSkuBoundaries(this.database, this.fixture);
    return evidence;
  }

  async cleanup(): Promise<boolean> {
    await cleanupSupplierPurchasableSkuSmokeFixture(
      this.database,
      this.fixture,
    );
    const verification = new Bun.SQL(
      createSupplierPurchasableSkuDatabaseOptions(
        this.databaseConnection,
        1,
      ),
    );
    try {
      return await countSupplierPurchasableSkuSmokeResiduals(
        verification,
        this.fixture,
      ) === 0;
    } finally {
      await verification.close(SUPPLIER_PURCHASABLE_SKU_CLOSE_OPTIONS);
    }
  }

  close(): Promise<void> {
    return this.database.close(SUPPLIER_PURCHASABLE_SKU_CLOSE_OPTIONS);
  }
}

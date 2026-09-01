import type { SupplierPurchasableSkuSmokeGateway } from
  "./supplier-purchasable-sku-smoke";
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

const CONNECTION_OPTIONS = {
  max: 4,
  prepare: false,
  connectionTimeout: 10,
} as const;

export class DirectSupplierPurchasableSkuSmokeGateway
implements SupplierPurchasableSkuSmokeGateway {
  private readonly database: Bun.SQL;
  private readonly fixture = createSupplierPurchasableSkuSmokeFixture();

  constructor(private readonly databaseUrl: string) {
    this.database = new Bun.SQL(databaseUrl, CONNECTION_OPTIONS);
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
    const verification = new Bun.SQL(this.databaseUrl, {
      ...CONNECTION_OPTIONS,
      max: 1,
    });
    try {
      return await countSupplierPurchasableSkuSmokeResiduals(
        verification,
        this.fixture,
      ) === 0;
    } finally {
      await verification.close();
    }
  }

  close(): Promise<void> {
    return this.database.close();
  }
}

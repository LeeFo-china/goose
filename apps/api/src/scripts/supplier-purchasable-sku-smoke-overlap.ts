import { isDeepStrictEqual } from "node:util";
import type { TransactionSQL } from "bun";

import {
  SupplierPurchasableSkuCommandFailureSchema,
} from "@/repositories/supplier-purchasable-sku-records";
import type { SupplierPurchasableSkuSmokeFixture } from
  "./supplier-purchasable-sku-smoke-fixture";
import {
  commandSupplierPurchasableSku,
  createSupplierPurchasableSkuSmokeCommand,
  getSupplierPurchasableSkuSmokeContext,
  getSupplierPurchasableSkuSmokeVersion,
  setSupplierPriceListEffectiveUntil,
  snapshotSupplierPriceSeries,
} from "./supplier-purchasable-sku-smoke-queries";

export async function verifyNoopPeriodOverlapGuard(
  database: Bun.SQL,
  fixture: SupplierPurchasableSkuSmokeFixture,
  currentListId: string,
  nextFrom: string,
): Promise<void> {
  const overlapUntil = new Date(Date.parse(nextFrom) + 3_600_000).toISOString();
  try {
    await database.begin(async (transaction) => {
      await transaction`set local statement_timeout = '20s'`.simple();
      await transaction`set local session_replication_role = replica`.simple();
      await setSupplierPriceListEffectiveUntil(
        transaction as unknown as TransactionSQL,
        currentListId,
        overlapUntil,
      );
      await transaction`set local session_replication_role = origin`.simple();
      const context = await getSupplierPurchasableSkuSmokeContext(
        transaction as unknown as TransactionSQL,
        fixture,
      );
      const currentPrice = context.current_price;
      if (!currentPrice) throw new Error("SMOKE_OVERLAP_MISSING");
      const before = await snapshotSupplierPriceSeries(
        transaction as unknown as TransactionSQL,
        fixture,
      );
      const skuVersion = await getSupplierPurchasableSkuSmokeVersion(
        transaction as unknown as TransactionSQL,
        fixture.skuId,
      );
      const result = await commandSupplierPurchasableSku(
        transaction as unknown as TransactionSQL,
        createSupplierPurchasableSkuSmokeCommand(fixture, {
          action: "update",
          expectedSkuVersion: skuVersion,
          expectedPriceListId: currentListId,
          expectedPriceListVersion: currentPrice.supplier_price_list_row_version,
          sku: { name: `task8-${fixture.token}-overlap-noop` },
          unitPrice: currentPrice.unit_price,
          idempotencyKey: `task8:${fixture.token}:overlap-noop`,
        }),
      );
      const failure = SupplierPurchasableSkuCommandFailureSchema.safeParse(
        result,
      );
      if (!failure.success || failure.data.status !== "state_conflict" ||
        failure.data.error_code !== "SUPPLIER_PRICE_PERIOD_CONFLICT") {
        throw new Error("SMOKE_NOOP_PERIOD_CONFLICT_MISSING");
      }
      if (skuVersion !== await getSupplierPurchasableSkuSmokeVersion(
        transaction as unknown as TransactionSQL,
        fixture.skuId,
      ) || !isDeepStrictEqual(
        before,
        await snapshotSupplierPriceSeries(
          transaction as unknown as TransactionSQL,
          fixture,
        ),
      )) throw new Error("SMOKE_NOOP_PERIOD_CONFLICT_CHANGED_STATE");
      throw new Error("SMOKE_NOOP_PERIOD_CONFLICT_ROLLBACK");
    });
  } catch (error) {
    if (error instanceof Error &&
      error.message === "SMOKE_NOOP_PERIOD_CONFLICT_ROLLBACK") return;
    throw error;
  }
}

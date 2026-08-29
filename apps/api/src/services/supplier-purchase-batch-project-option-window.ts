import type { SupplierPurchaseBatchProjectOptionQuery } from "@/schema/supplier-purchase-batches";

type UpdatedWindow = NonNullable<
  SupplierPurchaseBatchProjectOptionQuery["updatedWindow"]
>;

export type SupplierPurchaseBatchProjectOptionUpdatedAtRange =
  | {
    updated_at_from: string;
    updated_at_to: string;
    updated_at_before?: never;
  }
  | {
    updated_at_from: string;
    updated_at_before: string;
    updated_at_to?: never;
  };

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const SHANGHAI_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export function resolveSupplierPurchaseBatchProjectOptionWindow(
  window: UpdatedWindow,
  now: Date,
): SupplierPurchaseBatchProjectOptionUpdatedAtRange {
  if (window === "last_7_days") {
    return {
      updated_at_from: new Date(now.getTime() - SEVEN_DAYS_MS).toISOString(),
      updated_at_to: now.toISOString(),
    };
  }

  const shanghaiNow = new Date(now.getTime() + SHANGHAI_UTC_OFFSET_MS);
  const year = shanghaiNow.getUTCFullYear();
  const month = shanghaiNow.getUTCMonth();

  return {
    updated_at_from: shanghaiMonthBoundary(year, month),
    updated_at_before: shanghaiMonthBoundary(year, month + 1),
  };
}

function shanghaiMonthBoundary(year: number, month: number): string {
  return new Date(
    Date.UTC(year, month, 1) - SHANGHAI_UTC_OFFSET_MS,
  ).toISOString();
}

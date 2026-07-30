import {
  SMOKE_IDS as PURCHASE_ORDER_SMOKE_IDS,
  seedSupplierFixture,
  selectFixtureReferences,
  type FixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";
import {
  orderCommand,
  saveDraft,
} from "./supplier-purchase-order-smoke-commands";

export const FULFILLMENT_SMOKE_IDS = {
  order: "24000000-0000-4000-8000-000000000001",
  shipment: "24000000-0000-4000-8000-000000000002",
  overShipment: "24000000-0000-4000-8000-000000000003",
  prematureReceipt: "24000000-0000-4000-8000-000000000004",
  partialReceipt: "24000000-0000-4000-8000-000000000005",
  overReceipt: "24000000-0000-4000-8000-000000000006",
  missingVarianceReceipt: "24000000-0000-4000-8000-000000000007",
  finalReceipt: "24000000-0000-4000-8000-000000000008",
} as const;

export type FulfillmentSmokeSql = SmokeSql;

export type FulfillmentSmokeFixture = FixtureReferences & {
  order_item_id: string;
};

class SupplierPurchaseFulfillmentFixtureError extends Error {}

function requireCommandStatus(
  value: unknown,
  status: string,
  label: string,
) {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("status" in value) ||
    value.status !== status
  ) {
    throw new SupplierPurchaseFulfillmentFixtureError(
      `${label} did not return ${status}`,
    );
  }
}

export async function seedFulfillmentFixture(
  sql: FulfillmentSmokeSql,
): Promise<FulfillmentSmokeFixture> {
  const fixture = await selectFixtureReferences(sql);
  await seedSupplierFixture(sql, fixture);

  requireCommandStatus(
    await saveDraft(
      sql,
      fixture,
      0,
      10,
      "fulfillment-smoke-save",
      { orderId: FULFILLMENT_SMOKE_IDS.order },
    ),
    "saved",
    "fixture draft",
  );
  requireCommandStatus(
    await orderCommand(sql, fixture, "submit", 1, {
      orderId: FULFILLMENT_SMOKE_IDS.order,
    }),
    "submitted",
    "fixture submit",
  );

  const rows = await sql<{ id: string }[]>`
    select purchase_item.id
    from public.supplier_purchase_order_items as purchase_item
    where purchase_item.tenant_id = ${fixture.tenant_id}::uuid
      and purchase_item.supplier_purchase_order_id =
        ${FULFILLMENT_SMOKE_IDS.order}::uuid
      and purchase_item.supplier_id = ${PURCHASE_ORDER_SMOKE_IDS.supplier}::uuid
    order by purchase_item.line_no, purchase_item.id
    limit 2;
  `;
  if (rows.length !== 1 || !rows[0]?.id) {
    throw new SupplierPurchaseFulfillmentFixtureError(
      "fixture must have exactly one purchase order item",
    );
  }
  return { ...fixture, order_item_id: rows[0].id };
}

import {
  SMOKE_IDS,
  createPublishedPrice,
  seedSupplierFixture,
  selectFixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";
import {
  expectDatabaseError,
  orderCommand,
  runRolledBackSavepoint,
  saveDraft,
} from "./supplier-purchase-order-smoke-commands";

export { SMOKE_IDS };

type TransactionDatabase<Transaction> = {
  begin<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T>;
};

type CommandExpectation = {
  status: "saved" | "submitted" | "cancelled";
  idempotent: boolean;
  version: number;
  totalAmount?: string;
};

type PurchaseOrderCommandResult = {
  status: string;
  idempotent: boolean;
  version: number;
  purchase_order: Record<string, unknown>;
};

class ForcedRollback extends Error {
  constructor() {
    super("supplier purchase order smoke rollback");
  }
}

export class SupplierPurchaseOrderSmokeAssertionError extends Error {}

export async function runWithForcedRollback<Transaction, Result>(
  database: TransactionDatabase<Transaction>,
  callback: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  const sentinel = new ForcedRollback();
  let callbackResult: Result | undefined;
  let callbackError: unknown;
  let callbackCompleted = false;

  try {
    await database.begin(async (transaction) => {
      try {
        callbackResult = await callback(transaction);
        callbackCompleted = true;
      } catch (error) {
        callbackError = error;
      }
      throw sentinel;
    });
  } catch (error) {
    if (error !== sentinel) throw error;
  }

  if (callbackError !== undefined) throw callbackError;
  if (!callbackCompleted) {
    throw new SupplierPurchaseOrderSmokeAssertionError(
      "smoke callback did not complete before rollback",
    );
  }
  return callbackResult as Result;
}

export function assertCommandResult(
  value: unknown,
  expected: CommandExpectation,
): PurchaseOrderCommandResult {
  const result = requireRecord(value, "command result");
  if (!("purchase_order" in result)) {
    throw new SupplierPurchaseOrderSmokeAssertionError(
      `command ${String(result.status)} has no purchase_order`,
    );
  }
  const purchaseOrder = requireRecord(
    result.purchase_order,
    "purchase_order",
  );
  assertEqual(result.status, expected.status, "status");
  assertEqual(result.idempotent, expected.idempotent, "idempotent");
  assertEqual(result.version, expected.version, "version");
  for (
    const field of [
      "subtotal_amount",
      "tax_amount",
      "total_amount",
    ] as const
  ) {
    if (typeof purchaseOrder[field] !== "string") {
      throw new SupplierPurchaseOrderSmokeAssertionError(
        `purchase_order.${field} must be a string`,
      );
    }
  }
  if (expected.totalAmount !== undefined) {
    assertEqual(
      purchaseOrder.total_amount,
      expected.totalAmount,
      "purchase_order.total_amount",
    );
  }
  return result as PurchaseOrderCommandResult;
}

function requireRecord(value: unknown, label: string) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchaseOrderSmokeAssertionError(
      `${label} must be an object`,
    );
  }
  return value as Record<string, unknown>;
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new SupplierPurchaseOrderSmokeAssertionError(
      `${label} must equal ${String(expected)}`,
    );
  }
}

type SmokeSummary = {
  draft_saved: boolean;
  idempotent_replay: boolean;
  idempotency_conflict: boolean;
  version_conflict: boolean;
  price_changed: boolean;
  repriced_and_submitted: boolean;
  submitted_cancelled: boolean;
  draft_cancelled: boolean;
  submitted_facts_immutable: boolean;
  amount_limit_enforced: boolean;
  cross_tenant_id_collision_safe: boolean;
  supplier_options_paginated: boolean;
  tenant_isolation: boolean;
  transaction_rolled_back: boolean;
};

async function executeSmoke(
  sql: SmokeSql,
): Promise<Omit<SmokeSummary, "transaction_rolled_back">> {
  const fixture = await selectFixtureReferences(sql);
  await seedSupplierFixture(sql, fixture);
  const optionRows = await sql<{ result: unknown }[]>`
    select public.list_supplier_purchase_order_supplier_options(
      ${fixture.tenant_id}::uuid,
      now(),
      '采购单 Smoke',
      1,
      1
    ) as result;
  `;
  const optionResult = requireRecord(
    optionRows[0]?.result,
    "supplier options",
  );
  if (
    !Array.isArray(optionResult.items) ||
    optionResult.items.length !== 1 ||
    requireRecord(optionResult.items[0], "supplier option")
        .tenant_supplier_id !== SMOKE_IDS.relationship ||
    optionResult.page !== 1 ||
    optionResult.page_size !== 1
  ) {
    throw new SupplierPurchaseOrderSmokeAssertionError(
      "supplier options must be eligible and paginated",
    );
  }

  const first = assertCommandResult(
    await saveDraft(sql, fixture, 0, 2, "smoke-save-1"),
    { status: "saved", idempotent: false, version: 1, totalAmount: "20.00" },
  );
  const replay = assertCommandResult(
    await saveDraft(sql, fixture, 0, 2, "smoke-save-1"),
    { status: "saved", idempotent: true, version: 1, totalAmount: "20.00" },
  );
  await expectDatabaseError(
    sql,
    (savepoint) => saveDraft(
      savepoint,
      fixture,
      0,
      3,
      "smoke-save-1",
    ),
    "SUPPLIER_IDEMPOTENCY_CONFLICT",
  );
  const versionConflict = requireRecord(
    await saveDraft(sql, fixture, 0, 2, "smoke-save-stale"),
    "version conflict",
  );
  const crossTenantIdCollision = requireRecord(
    await saveDraft(
      sql,
      fixture,
      0,
      2,
      "smoke-other-tenant-id-collision",
      {
        tenantId: fixture.other_tenant_id,
        projectId: fixture.other_project_id,
        relationshipId: SMOKE_IDS.otherRelationship,
        userId: fixture.other_user_id,
        employeeId: fixture.other_employee_id,
      },
    ),
    "cross tenant id collision",
  );
  assertEqual(
    crossTenantIdCollision.status,
    "state_conflict",
    "cross tenant id collision status",
  );
  assertEqual(
    crossTenantIdCollision.error_code,
    "SUPPLIER_PURCHASE_ORDER_ID_CONFLICT",
    "cross tenant id collision error code",
  );
  if ("version" in crossTenantIdCollision) {
    throw new SupplierPurchaseOrderSmokeAssertionError(
      "cross tenant id collision must not reveal a version",
    );
  }

  assertCommandResult(
    await saveDraft(
      sql,
      fixture,
      0,
      2,
      "smoke-other-tenant-save",
      {
        orderId: SMOKE_IDS.otherOrder,
        tenantId: fixture.other_tenant_id,
        projectId: fixture.other_project_id,
        relationshipId: SMOKE_IDS.otherRelationship,
        userId: fixture.other_user_id,
        employeeId: fixture.other_employee_id,
      },
    ),
    { status: "saved", idempotent: false, version: 1, totalAmount: "20.00" },
  );

  const primaryTenantRows = await sql<{ id: string }[]>`
    select purchase_order.id
    from public.supplier_purchase_orders AS purchase_order
    where purchase_order.tenant_id = ${fixture.tenant_id}::uuid
      and purchase_order.id in (
        ${SMOKE_IDS.order}::uuid,
        ${SMOKE_IDS.otherOrder}::uuid
      )
    order by purchase_order.id;
  `;
  const otherTenantRows = await sql<{ id: string }[]>`
    select purchase_order.id
    from public.supplier_purchase_orders AS purchase_order
    where purchase_order.tenant_id = ${fixture.other_tenant_id}::uuid
      and purchase_order.id in (
        ${SMOKE_IDS.order}::uuid,
        ${SMOKE_IDS.otherOrder}::uuid
      )
    order by purchase_order.id;
  `;
  assertCommandResult(
    await orderCommand(sql, fixture, "cancel", 1, {
      orderId: SMOKE_IDS.otherOrder,
      tenantId: fixture.other_tenant_id,
      userId: fixture.other_user_id,
      employeeId: fixture.other_employee_id,
    }),
    { status: "cancelled", idempotent: false, version: 2, totalAmount: "20.00" },
  );

  let amountLimitEnforced = false;
  await runRolledBackSavepoint(sql, async (savepoint) => {
    await savepoint`
      update public.supplier_price_lists
      set lifecycle_status = 'retired', row_version = row_version + 1
      where id = ${SMOKE_IDS.priceList}::uuid;
    `;
    await createPublishedPrice(
      savepoint,
      fixture,
      SMOKE_IDS.overflowPriceList,
      SMOKE_IDS.overflowPriceItem,
      2,
      "1000.00",
    );
    const overflow = requireRecord(
      await saveDraft(
        savepoint,
        fixture,
        0,
        10_000_000_000_000,
        "smoke-amount-overflow",
        { orderId: SMOKE_IDS.overflowOrder },
      ),
      "amount overflow",
    );
    assertEqual(overflow.status, "validation_error", "amount overflow status");
    assertEqual(
      overflow.error_code,
      "SUPPLIER_PURCHASE_ORDER_AMOUNT_LIMIT_EXCEEDED",
      "amount overflow error code",
    );
    amountLimitEnforced = true;
  });

  await sql`
    update public.supplier_price_lists
    set lifecycle_status = 'retired', row_version = row_version + 1
    where id = ${SMOKE_IDS.priceList}::uuid;
  `;
  await createPublishedPrice(
    sql,
    fixture,
    SMOKE_IDS.replacementPriceList,
    SMOKE_IDS.replacementPriceItem,
    2,
    "12.00",
  );
  const priceChanged = requireRecord(
    await orderCommand(sql, fixture, "submit", 1),
    "price changed",
  );
  assertEqual(priceChanged.status, "price_changed", "price changed status");

  assertCommandResult(
    await saveDraft(sql, fixture, 1, 2, "smoke-save-2"),
    { status: "saved", idempotent: false, version: 2, totalAmount: "24.00" },
  );
  assertCommandResult(
    await orderCommand(sql, fixture, "submit", 2),
    { status: "submitted", idempotent: false, version: 3, totalAmount: "24.00" },
  );
  await expectDatabaseError(
    sql,
    (savepoint) => savepoint`
      update public.supplier_purchase_orders
      set status = 'draft',
          submitted_by_employee_id = null,
          submitted_at = null
      where id = ${SMOKE_IDS.order}::uuid;
    `,
    "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
  );
  await expectDatabaseError(
    sql,
    (savepoint) => savepoint`
      update public.supplier_purchase_order_items
      set supplier_purchase_order_id = ${SMOKE_IDS.otherOrder}::uuid
      where supplier_purchase_order_id = ${SMOKE_IDS.order}::uuid;
    `,
    "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
  );
  await expectDatabaseError(
    sql,
    (savepoint) => savepoint`
      delete from public.supplier_purchase_order_items
      where supplier_purchase_order_id = ${SMOKE_IDS.order}::uuid;
    `,
    "SUPPLIER_PURCHASE_ORDER_STATE_CONFLICT",
  );
  assertCommandResult(
    await orderCommand(sql, fixture, "cancel", 3),
    { status: "cancelled", idempotent: false, version: 4, totalAmount: "24.00" },
  );

  const crossTenantMutation = requireRecord(
    await orderCommand(sql, fixture, "cancel", 4, {
      tenantId: fixture.other_tenant_id,
      userId: fixture.other_user_id,
      employeeId: fixture.other_employee_id,
    }),
    "cross tenant mutation",
  );
  assertEqual(
    crossTenantMutation.status,
    "not_found",
    "cross tenant mutation status",
  );
  return {
    draft_saved: first.version === 1,
    idempotent_replay: replay.idempotent,
    idempotency_conflict: true,
    version_conflict:
      versionConflict.status === "version_conflict" &&
      versionConflict.version === 1,
    price_changed: priceChanged.status === "price_changed",
    repriced_and_submitted: true,
    submitted_cancelled: true,
    draft_cancelled: true,
    submitted_facts_immutable: true,
    amount_limit_enforced: amountLimitEnforced,
    cross_tenant_id_collision_safe: true,
    supplier_options_paginated: true,
    tenant_isolation:
      primaryTenantRows.length === 1 &&
      primaryTenantRows[0]?.id === SMOKE_IDS.order &&
      otherTenantRows.length === 1 &&
      otherTenantRows[0]?.id === SMOKE_IDS.otherOrder &&
      crossTenantMutation.status === "not_found",
  };
}

export async function runSupplierPurchaseOrderSmoke(
  databaseUrl: string,
): Promise<SmokeSummary> {
  const db = new Bun.SQL(databaseUrl, { prepare: false });
  try {
    const result = await runWithForcedRollback(
      db,
      (transaction) => executeSmoke(transaction as SmokeSql),
    );
    const rows = await db<{ count: number }[]>`
      select count(*)::integer as count
      from public.supplier_purchase_orders
      where id in (
        ${SMOKE_IDS.order}::uuid,
        ${SMOKE_IDS.otherOrder}::uuid,
        ${SMOKE_IDS.overflowOrder}::uuid
      );
    `;
    const summary = {
      ...result,
      transaction_rolled_back: rows[0]?.count === 0,
    };
    if (Object.values(summary).some((passed) => !passed)) {
      throw new SupplierPurchaseOrderSmokeAssertionError(
        "supplier purchase order smoke check failed",
      );
    }
    return summary;
  } finally {
    await db.close();
  }
}

async function main() {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ||
    process.env.SUPABASE_DB_URL;
  if (!databaseUrl) {
    console.error("SUPPLIER_PURCHASE_ORDER_SMOKE_FAILED");
    process.exitCode = 1;
    return;
  }
  try {
    console.log(JSON.stringify(await runSupplierPurchaseOrderSmoke(databaseUrl)));
  } catch {
    console.error("SUPPLIER_PURCHASE_ORDER_SMOKE_FAILED");
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  void main();
}

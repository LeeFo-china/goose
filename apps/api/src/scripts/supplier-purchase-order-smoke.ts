import {
  SMOKE_IDS,
  createPublishedPrice,
  seedSupplierFixture,
  selectFixtureReferences,
  type FixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";

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
  tenant_isolation: boolean;
  transaction_rolled_back: boolean;
};

type ResultRow = { result: unknown };

async function saveDraft(
  sql: SmokeSql,
  fixture: FixtureReferences,
  expectedVersion: number,
  quantity: number,
  idempotencyKey: string,
) {
  const items = [
    { supplier_sku_id: SMOKE_IDS.sku, quantity },
  ];
  const rows = await sql<ResultRow[]>`
    select public.save_supplier_purchase_order_draft(
      ${SMOKE_IDS.order}::uuid, ${fixture.tenant_id}::uuid,
      ${fixture.project_id}::uuid, ${SMOKE_IDS.relationship}::uuid,
      ${expectedVersion}::integer, null::date, '数据库 smoke',
      ${items}::jsonb, ${fixture.user_id}::uuid,
      ${fixture.employee_id}::uuid, ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

async function orderCommand(
  sql: SmokeSql,
  fixture: FixtureReferences,
  action: "submit" | "cancel",
  expectedVersion: number,
  tenantId = fixture.tenant_id,
) {
  const rows = action === "submit"
    ? await sql<ResultRow[]>`
      select public.submit_supplier_purchase_order(
        ${SMOKE_IDS.order}::uuid, ${tenantId}::uuid,
        ${expectedVersion}::integer, ${fixture.user_id}::uuid,
        ${fixture.employee_id}::uuid, ${`smoke-submit-${expectedVersion}`}
      ) as result;
    `
    : await sql<ResultRow[]>`
      select public.cancel_supplier_purchase_order(
        ${SMOKE_IDS.order}::uuid, ${tenantId}::uuid,
        ${expectedVersion}::integer, '数据库 smoke 取消',
        ${fixture.user_id}::uuid, ${fixture.employee_id}::uuid,
        ${`smoke-cancel-${expectedVersion}-${tenantId}`}
      ) as result;
    `;
  return rows[0]?.result;
}

async function expectDatabaseError(
  sql: SmokeSql,
  callback: (savepoint: SmokeSql) => Promise<unknown>,
  message: string,
) {
  try {
    await sql.savepoint(callback);
  } catch (error) {
    if (
      error instanceof Bun.SQL.PostgresError &&
      error.errno === "P0001" &&
      error.message === message
    ) {
      return;
    }
    throw error;
  }
  throw new SupplierPurchaseOrderSmokeAssertionError(
    `expected database error ${message}`,
  );
}

async function executeSmoke(
  sql: SmokeSql,
): Promise<Omit<SmokeSummary, "transaction_rolled_back">> {
  const fixture = await selectFixtureReferences(sql);
  await seedSupplierFixture(sql, fixture);

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
  assertCommandResult(
    await orderCommand(sql, fixture, "cancel", 3),
    { status: "cancelled", idempotent: false, version: 4, totalAmount: "24.00" },
  );

  const crossTenantRows = await sql<{ count: number }[]>`
    select count(*)::integer as count
    from public.supplier_purchase_orders
    where id = ${SMOKE_IDS.order}::uuid
      and tenant_id = ${fixture.other_tenant_id}::uuid;
  `;
  await expectDatabaseError(
    sql,
    (savepoint) => orderCommand(
      savepoint,
      fixture,
      "cancel",
      4,
      fixture.other_tenant_id,
    ),
    "SUPPLIER_PROXY_ACTOR_INVALID",
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
    tenant_isolation: crossTenantRows[0]?.count === 0,
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
      where id in (${SMOKE_IDS.order}::uuid, ${SMOKE_IDS.otherOrder}::uuid);
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

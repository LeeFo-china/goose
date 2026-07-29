import {
  SMOKE_IDS,
  type FixtureReferences,
  type SmokeSql,
} from "./supplier-purchase-order-smoke-fixture";

type ResultRow = { result: unknown };
type DraftOverrides = Partial<{
  orderId: string;
  tenantId: string;
  projectId: string;
  relationshipId: string;
  userId: string;
  employeeId: string;
}>;
type CommandOverrides = Partial<
  Pick<DraftOverrides, "orderId" | "tenantId" | "userId" | "employeeId">
>;

export async function saveDraft(
  sql: SmokeSql,
  fixture: FixtureReferences,
  expectedVersion: number,
  quantity: number,
  idempotencyKey: string,
  overrides: DraftOverrides = {},
) {
  const context = {
    orderId: SMOKE_IDS.order,
    tenantId: fixture.tenant_id,
    projectId: fixture.project_id,
    relationshipId: SMOKE_IDS.relationship,
    userId: fixture.user_id,
    employeeId: fixture.employee_id,
    ...overrides,
  };
  const items = [{ supplier_sku_id: SMOKE_IDS.sku, quantity }];
  const rows = await sql<ResultRow[]>`
    select public.save_supplier_purchase_order_draft(
      ${context.orderId}::uuid, ${context.tenantId}::uuid,
      ${context.projectId}::uuid, ${context.relationshipId}::uuid,
      ${expectedVersion}::integer, null::date, '数据库 smoke',
      ${items}::jsonb, ${context.userId}::uuid,
      ${context.employeeId}::uuid, ${idempotencyKey}
    ) as result;
  `;
  return rows[0]?.result;
}

export async function orderCommand(
  sql: SmokeSql,
  fixture: FixtureReferences,
  action: "submit" | "cancel",
  expectedVersion: number,
  overrides: CommandOverrides = {},
) {
  const context = {
    orderId: SMOKE_IDS.order,
    tenantId: fixture.tenant_id,
    userId: fixture.user_id,
    employeeId: fixture.employee_id,
    ...overrides,
  };
  const rows = action === "submit"
    ? await sql<ResultRow[]>`
      select public.submit_supplier_purchase_order(
        ${context.orderId}::uuid, ${context.tenantId}::uuid,
        ${expectedVersion}::integer, ${context.userId}::uuid,
        ${context.employeeId}::uuid,
        ${`smoke-submit-${expectedVersion}-${context.tenantId}`}
      ) as result;
    `
    : await sql<ResultRow[]>`
      select public.cancel_supplier_purchase_order(
        ${context.orderId}::uuid, ${context.tenantId}::uuid,
        ${expectedVersion}::integer, '数据库 smoke 取消',
        ${context.userId}::uuid, ${context.employeeId}::uuid,
        ${`smoke-cancel-${expectedVersion}-${context.tenantId}`}
      ) as result;
    `;
  return rows[0]?.result;
}

export async function runRolledBackSavepoint(
  sql: SmokeSql,
  callback: (savepoint: SmokeSql) => Promise<void>,
) {
  const marker = new Error("supplier purchase order savepoint rollback");
  try {
    await sql.savepoint(async (savepoint) => {
      await callback(savepoint);
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
}

export async function expectDatabaseError(
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
  throw new Error(`expected database error ${message}`);
}

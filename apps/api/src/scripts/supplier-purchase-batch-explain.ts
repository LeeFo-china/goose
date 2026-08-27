import type { TransactionSQL } from "bun";

import {
  createRuntimeBatchSmokeFixture,
  prepareSubmittedBatch,
  reviewRuntimeBatch,
  seedRuntimeBatchSmokeFixture,
  type BatchSmokeFixture,
  type BatchSmokeSql,
} from "./supplier-purchase-batch-smoke-fixture";
import { assertLocalSupplierPurchaseBatchDatabaseUrl } from
  "./supplier-purchase-batch-local-db";

export const EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES = {
  catalogProduct: ["supplier_products_name_batch_catalog_trgm_idx"],
  catalogSku: ["supplier_skus_name_batch_catalog_trgm_idx"],
  batchRead: ["supplier_purchase_batches_tenant_status_updated_idx"],
  approval: ["supplier_purchase_batch_items_parent_line_idx"],
  requisitions: ["supplier_purchase_requisitions_batch_generation_idx"],
  orders: ["supplier_purchase_orders_batch_idx"],
} as const;

export const SUPPLIER_PURCHASE_BATCH_EXPLAIN_QUERIES = {
  catalogProduct: `explain (analyze, buffers, format json)
    select product.id, product.product_code, product.name
    from public.supplier_products as product
    where product.name ilike '%fixture-token%' limit 100`,
  catalogSku: `explain (analyze, buffers, format json)
    select sku.id, sku.sku_code, sku.name
    from public.supplier_skus as sku
    where sku.name ilike '%fixture-token%' limit 100`,
  batchRead: `explain (analyze, buffers, format json)
    select batch.id, batch.batch_no, batch.status, batch.updated_at
    from public.supplier_purchase_batches as batch
    where batch.tenant_id = 'tenant-id' and batch.status = 'ordered'
    order by batch.updated_at desc, batch.id desc limit 100`,
  approval: `explain (analyze, buffers, format json)
    select item.supplier_id, count(item.id), sum(item.line_total_amount)
    from public.supplier_purchase_batch_items as item
    where item.tenant_id = 'tenant-id' and item.purchase_batch_id = 'batch-id'
    group by item.supplier_id limit 100`,
  requisitions: `explain (analyze, buffers, format json)
    select requisition.id, requisition.tenant_supplier_id
    from public.supplier_purchase_requisitions as requisition
    where requisition.tenant_id = 'tenant-id'
      and requisition.purchase_batch_id = 'batch-id'
      and requisition.split_generation = 1 limit 100`,
  orders: `explain (analyze, buffers, format json)
    select purchase_order.id, purchase_order.tenant_supplier_id
    from public.supplier_purchase_orders as purchase_order
    where purchase_order.tenant_id = 'tenant-id'
      and purchase_order.purchase_batch_id = 'batch-id' limit 100`,
} as const;

export type ParsedSupplierPurchaseBatchExplainPlan = {
  indexNames: string[];
  hasRuntimeEvidence: boolean;
};

type ExplainName = keyof typeof EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES;
type ExplainPlanMap = Record<
  ExplainName,
  ParsedSupplierPurchaseBatchExplainPlan
>;

class SupplierPurchaseBatchExplainError extends Error {}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupplierPurchaseBatchExplainError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new SupplierPurchaseBatchExplainError(
      "QUERY PLAN must contain JSON",
    );
  }
}

function collectIndexes(nodeValue: unknown, names: string[]): void {
  const node = record(nodeValue, "EXPLAIN plan node");
  if (typeof node["Node Type"] !== "string") {
    throw new SupplierPurchaseBatchExplainError(
      "plan node Node Type is required",
    );
  }
  if (typeof node["Index Name"] === "string") names.push(node["Index Name"]);
  if (node.Plans === undefined) return;
  if (!Array.isArray(node.Plans)) {
    throw new SupplierPurchaseBatchExplainError("plan Plans must be an array");
  }
  for (const child of node.Plans) collectIndexes(child, names);
}

export function parseSupplierPurchaseBatchExplainPlan(
  rowsValue: unknown,
): ParsedSupplierPurchaseBatchExplainPlan {
  if (!Array.isArray(rowsValue) || rowsValue.length !== 1) {
    throw new SupplierPurchaseBatchExplainError(
      "EXPLAIN must return exactly one row",
    );
  }
  const row = record(rowsValue[0], "EXPLAIN row");
  const json = parseJson(row["QUERY PLAN"]);
  if (!Array.isArray(json) || json.length !== 1) {
    throw new SupplierPurchaseBatchExplainError(
      "QUERY PLAN must contain exactly one plan",
    );
  }
  const root = record(json[0], "EXPLAIN root");
  const indexNames: string[] = [];
  collectIndexes(root.Plan, indexNames);
  return {
    indexNames: [...new Set(indexNames)],
    hasRuntimeEvidence:
      typeof root["Planning Time"] === "number" &&
      typeof root["Execution Time"] === "number",
  };
}

export function assertSupplierPurchaseBatchExplainPlans(
  plans: Record<string, ParsedSupplierPurchaseBatchExplainPlan>,
): true {
  for (
    const name of Object.keys(
      EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES,
    ) as ExplainName[]
  ) {
    const plan = plans[name];
    if (!plan?.hasRuntimeEvidence) {
      throw new SupplierPurchaseBatchExplainError(
        `${name} EXPLAIN runtime evidence is required`,
      );
    }
    const used = new Set(plan.indexNames);
    for (const expected of EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES[name]) {
      if (!used.has(expected)) {
        throw new SupplierPurchaseBatchExplainError(
          `${name} EXPLAIN must use ${expected}; used ${[...used].join(", ")}`,
        );
      }
    }
  }
  return true;
}

async function explainQuery(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
  batchId: string,
  name: ExplainName,
): Promise<unknown> {
  switch (name) {
    case "catalogProduct":
      return sql`explain (analyze, buffers, format json)
        select product.id, product.product_code, product.name
        from public.supplier_products as product
        where product.name ilike ${`%${fixture.runToken}%`} limit 100`;
    case "catalogSku":
      return sql`explain (analyze, buffers, format json)
        select sku.id, sku.sku_code, sku.name
        from public.supplier_skus as sku
        where sku.name ilike ${`%${fixture.runToken}%`} limit 100`;
    case "batchRead":
      return sql`explain (analyze, buffers, format json)
        select batch.id, batch.batch_no, batch.status, batch.updated_at
        from public.supplier_purchase_batches as batch
        where batch.tenant_id = ${fixture.tenantId}::uuid
          and batch.status = 'ordered'
        order by batch.updated_at desc, batch.id desc limit 100`;
    case "approval":
      return sql`explain (analyze, buffers, format json)
        select item.supplier_id, count(item.id), sum(item.line_total_amount)
        from public.supplier_purchase_batch_items as item
        where item.tenant_id = ${fixture.tenantId}::uuid
          and item.purchase_batch_id = ${batchId}::uuid
        group by item.supplier_id limit 100`;
    case "requisitions":
      return sql`explain (analyze, buffers, format json)
        select requisition.id, requisition.tenant_supplier_id
        from public.supplier_purchase_requisitions as requisition
        where requisition.tenant_id = ${fixture.tenantId}::uuid
          and requisition.purchase_batch_id = ${batchId}::uuid
          and requisition.split_generation = 1 limit 100`;
    case "orders":
      return sql`explain (analyze, buffers, format json)
        select purchase_order.id, purchase_order.tenant_supplier_id
        from public.supplier_purchase_orders as purchase_order
        where purchase_order.tenant_id = ${fixture.tenantId}::uuid
          and purchase_order.purchase_batch_id = ${batchId}::uuid limit 100`;
  }
}

async function seedBatchReadCardinality(
  sql: BatchSmokeSql,
  fixture: BatchSmokeFixture,
): Promise<void> {
  await sql`
    insert into public.supplier_purchase_batches(
      id, tenant_id, project_id, batch_no, status, reason, priced_at,
      created_by_employee_id, updated_by_employee_id
    )
    select md5(${`batch-explain-${fixture.runToken}-`} || generated.no)::uuid,
      ${fixture.tenantId}::uuid, ${fixture.projectId}::uuid,
      'PB-20991230-' || lpad(generated.no::text, 8, '0'),
      'draft', '回滚 EXPLAIN 基数', now(),
      ${fixture.actorEmployeeId}::uuid, ${fixture.actorEmployeeId}::uuid
    from generate_series(1, 5000) as generated(no);
  `;
  await sql`analyze public.supplier_purchase_batches`.simple();
}

class ForcedRollback extends Error {}

async function runWithRollback<Result>(
  database: Bun.SQL,
  callback: (sql: TransactionSQL) => Promise<Result>,
): Promise<Result> {
  const marker = new ForcedRollback();
  let result: Result | undefined;
  let failure: unknown;
  try {
    await database.begin(async (transaction) => {
      try {
        result = await callback(transaction);
      } catch (error) {
        failure = error;
      }
      throw marker;
    });
  } catch (error) {
    if (error !== marker) throw error;
  }
  if (failure !== undefined) throw failure;
  if (result === undefined) {
    throw new SupplierPurchaseBatchExplainError("EXPLAIN produced no result");
  }
  return result;
}

export type SupplierPurchaseBatchExplainSummary = {
  indexes: Record<ExplainName, string[]>;
  query_count: 6;
  transaction_rolled_back: true;
};

export async function runSupplierPurchaseBatchExplain(
  databaseUrl: string | undefined,
): Promise<SupplierPurchaseBatchExplainSummary> {
  const localDatabaseUrl = assertLocalSupplierPurchaseBatchDatabaseUrl(
    databaseUrl,
  );
  const database = new Bun.SQL(localDatabaseUrl, { max: 1, prepare: false });
  const runToken = crypto.randomUUID().replaceAll("-", "").slice(0, 12);
  let fixture: BatchSmokeFixture | undefined;
  try {
    const plans = await runWithRollback(database, async (sql) => {
      fixture = await createRuntimeBatchSmokeFixture(sql, runToken);
      await seedRuntimeBatchSmokeFixture(sql, fixture);
      const prepared = await prepareSubmittedBatch(sql, fixture, "explain");
      await reviewRuntimeBatch(sql, fixture, prepared.batchId, "explain:review");
      await seedBatchReadCardinality(sql, fixture);
      await sql`set local enable_seqscan = off`;
      const results = {} as ExplainPlanMap;
      for (
        const name of Object.keys(
          EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES,
        ) as ExplainName[]
      ) {
        results[name] = parseSupplierPurchaseBatchExplainPlan(
          await explainQuery(sql, fixture, prepared.batchId, name),
        );
      }
      return results;
    });
    assertSupplierPurchaseBatchExplainPlans(plans);
    const residuals = fixture
      ? await database<{ count: number }[]>`
        select count(*)::integer as count from public.employees
        where id in (${fixture.actorEmployeeId}::uuid,
          ${fixture.reviewerEmployeeId}::uuid) limit 1`
      : [];
    if (residuals[0]?.count !== 0) {
      throw new SupplierPurchaseBatchExplainError(
        "EXPLAIN rollback fixture left residual rows",
      );
    }
    const names = Object.keys(
      EXPECTED_SUPPLIER_PURCHASE_BATCH_INDEXES,
    ) as ExplainName[];
    return {
      indexes: Object.fromEntries(
        names.map((name) => [name, plans[name].indexNames]),
      ) as Record<ExplainName, string[]>,
      query_count: 6,
      transaction_rolled_back: true,
    };
  } finally {
    await database.close();
  }
}

if (import.meta.main) {
  const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
    process.env.SUPABASE_DB_URL;
  runSupplierPurchaseBatchExplain(databaseUrl)
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch(() => {
      console.error("SUPPLIER_PURCHASE_BATCH_EXPLAIN_FAILED");
      process.exitCode = 1;
    });
}

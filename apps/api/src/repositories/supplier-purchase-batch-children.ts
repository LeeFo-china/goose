import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import {
  SUPPLIER_PURCHASE_BATCH_ITEM_SELECT,
  SupplierPurchaseBatchItemSchema,
  SupplierPurchaseBatchOrderSchema,
  SupplierPurchaseBatchRequisitionSchema,
  type SupplierPurchaseBatchItem,
  type SupplierPurchaseBatchOrder,
  type SupplierPurchaseBatchRequisition,
} from "@/repositories/supplier-purchase-batch-records";
import type {
  BatchChildPageInput,
  Page,
} from "@/repositories/supplier-purchase-batches";
import { SUPPLIER_PURCHASE_ORDER_SELECT } from "@/repositories/supplier-purchase-order-records";
import { SUPPLIER_PURCHASE_REQUISITION_SELECT } from "@/repositories/supplier-purchase-requisition-records";

type QueryResult = {
  data: unknown;
  error: unknown;
  count: number | null;
};
type Query = {
  select: (...args: unknown[]) => Query;
  eq: (column: string, value: unknown) => Query;
  in: (column: string, values: readonly string[]) => Query;
  order: (column: string, options: { ascending: boolean }) => Query;
  range: (start: number, end: number) => Query;
  then: Promise<QueryResult>["then"];
};
type Client = { from: (table: string) => Query };
type ChildSpec<T> = {
  input: BatchChildPageInput;
  table: string;
  select: string;
  schema: z.ZodType<T>;
  message: string;
  order: [string, string];
  parentConstraint: string;
  descending?: boolean;
};

export function listSupplierPurchaseBatchItems(
  client: Client,
  input: BatchChildPageInput,
): Promise<Page<SupplierPurchaseBatchItem>> {
  return listChild(client, {
    input,
    table: "supplier_purchase_batch_items",
    select: SUPPLIER_PURCHASE_BATCH_ITEM_SELECT,
    schema: SupplierPurchaseBatchItemSchema,
    message: "查询供应商采购批次明细失败",
    order: ["line_no", "id"],
    parentConstraint: "supplier_purchase_batch_items_parent_tenant_fkey",
  });
}

export function listSupplierPurchaseBatchRequisitions(
  client: Client,
  input: BatchChildPageInput,
): Promise<Page<SupplierPurchaseBatchRequisition>> {
  return listChild(client, {
    input,
    table: "supplier_purchase_requisitions",
    select: SUPPLIER_PURCHASE_REQUISITION_SELECT,
    schema: SupplierPurchaseBatchRequisitionSchema,
    message: "查询采购批次申请失败",
    order: ["updated_at", "id"],
    parentConstraint: "supplier_purchase_requisitions_batch_tenant_fkey",
    descending: true,
  });
}

export function listSupplierPurchaseBatchOrders(
  client: Client,
  input: BatchChildPageInput,
): Promise<Page<SupplierPurchaseBatchOrder>> {
  return listChild(client, {
    input,
    table: "supplier_purchase_orders",
    select: SUPPLIER_PURCHASE_ORDER_SELECT,
    schema: SupplierPurchaseBatchOrderSchema,
    message: "查询采购批次采购单失败",
    order: ["updated_at", "id"],
    parentConstraint: "supplier_purchase_orders_batch_tenant_fkey",
    descending: true,
  });
}

const BatchScopeRowSchema = z.object({
  _batch_scope: z.object({ project_id: z.uuid() }).strict(),
}).passthrough();

async function listChild<T>(
  client: Client,
  spec: ChildSpec<T>,
): Promise<Page<T>> {
  const pagination = {
    page: Math.max(spec.input.page, 1),
    pageSize: Math.min(Math.max(spec.input.pageSize, 1), 100),
  };
  if (spec.input.visible_project_ids?.length === 0) {
    return toPage([], pagination, 0);
  }
  const scoped = Boolean(spec.input.visible_project_ids);
  const select = scoped
    ? `${spec.select},_batch_scope:supplier_purchase_batches!${spec.parentConstraint}!inner(project_id)`
    : spec.select;
  let request = client.from(spec.table)
    .select(select, { count: "exact" })
    .eq("tenant_id", spec.input.tenant_id)
    .eq("purchase_batch_id", spec.input.batch_id);
  if (spec.input.visible_project_ids) {
    request = request.in(
      "_batch_scope.project_id",
      spec.input.visible_project_ids,
    );
  }
  const start = (pagination.page - 1) * pagination.pageSize;
  const ascending = !spec.descending;
  const { data, error, count } = await request
    .order(spec.order[0], { ascending })
    .order(spec.order[1], { ascending })
    .range(start, start + pagination.pageSize - 1);
  if (error) throw Errors.dbError(spec.message, error);
  return toPage(
    parseRows(spec.schema, removeBatchScope(data, scoped), spec.message),
    pagination,
    count,
  );
}

function removeBatchScope(data: unknown, scoped: boolean): unknown {
  if (!scoped) return data;
  const parsed = z.array(BatchScopeRowSchema).safeParse(data);
  if (!parsed.success) throw Errors.dbError("查询供应商采购批次范围失败");
  return parsed.data.map(({ _batch_scope: _scope, ...row }) => row);
}

function parseRows<T>(
  schema: z.ZodType<T>,
  data: unknown,
  message: string,
): T[] {
  const result = z.array(schema).safeParse(data ?? []);
  if (result.success) return result.data;
  throw Errors.dbError(message, result.error.issues);
}

function toPage<T>(
  list: T[],
  pagination: { page: number; pageSize: number },
  count: number | null,
): Page<T> {
  const total = count ?? 0;
  return {
    list,
    pagination: {
      ...pagination,
      total,
      totalPages: total ? Math.ceil(total / pagination.pageSize) : 0,
    },
  };
}

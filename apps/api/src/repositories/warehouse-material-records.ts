import {
  WAREHOUSE_ISSUE_STATUS_VALUES, WAREHOUSE_RETURN_STATUS_VALUES,
} from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';

const uuid = z.uuid();
const quantity = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
// Legacy projects may have a null/blank name; keep the display contract a string.
const projectLabel = z.string().nullable().transform((name) => name?.trim() ? name : '未命名项目');
const order = z.object({
  id: uuid, tenant_id: uuid, warehouse_id: uuid, project_id: uuid,
  order_no: z.string().min(1), version: z.number().int().positive(), reason: z.string().nullable(),
  created_by_employee_id: uuid, updated_by_employee_id: uuid,
  created_at: z.string(), updated_at: z.string(), completed_at: z.string().nullable(), cancelled_at: z.string().nullable(),
}).strict();
export const WarehouseIssueOrderSchema = order.extend({
  status: z.enum(WAREHOUSE_ISSUE_STATUS_VALUES), submitted_at: z.string().nullable(),
});
export const WarehouseReturnOrderSchema = order.extend({
  status: z.enum(WAREHOUSE_RETURN_STATUS_VALUES), original_issue_order_id: uuid,
});
const summary = {
  warehouse_name: z.string(), project_name: projectLabel, total_amount: amount.nullable(),
  item_count: z.number().int().nonnegative(),
};
export const WarehouseIssueSummarySchema = WarehouseIssueOrderSchema.extend({
  ...summary, document_type: z.literal('issue'), original_issue_order_no: z.null().optional(),
});
export const WarehouseReturnSummarySchema = WarehouseReturnOrderSchema.extend({
  ...summary, document_type: z.literal('return'), original_issue_order_no: z.string().min(1),
});
const item = z.object({
  id: uuid, tenant_id: uuid, warehouse_id: uuid, project_id: uuid,
  line_no: z.number().int().min(1).max(100), supplier_sku_id: uuid,
  sku_name: z.string(), sku_code: z.string(), quantity, unit_cost: quantity.nullable(), amount: amount.nullable(),
  cost_category_id: uuid.nullable(), cost_category_name: z.string().nullable(),
  original_issued_quantity: quantity, original_issued_amount: amount.nullable(),
  returned_quantity: quantity, returned_amount: amount, returnable_quantity: quantity,
}).strict();
export const WarehouseIssueItemSchema = item.extend({ issue_order_id: uuid });
export const WarehouseReturnItemSchema = item.extend({
  return_order_id: uuid, original_issue_order_id: uuid, original_issue_item_id: uuid,
});
export const WarehouseMaterialProjectSchema = z.object({ id: uuid, name: projectLabel }).strict();

export interface WarehouseMaterialActor {
  tenant_id: string;
  actor_user_id: string;
  actor_employee_id: string;
}
export interface WarehouseMaterialPageInput { page: number; pageSize: number }
export interface WarehouseMaterialPage<T> {
  list: T[];
  pagination: WarehouseMaterialPageInput & { total: number; totalPages: number };
}
export interface WarehouseMaterialRpcClient {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export function materialActorParams(input: WarehouseMaterialActor): Record<string, unknown> {
  return { p_tenant_id: input.tenant_id, p_actor_user_id: input.actor_user_id, p_actor_employee_id: input.actor_employee_id };
}
export function parseMaterialRecord<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.dbError('领退料数据格式错误', result.error.issues);
  return result.data;
}
export function parseMaterialPage<T>(schema: z.ZodType<T>, data: unknown): WarehouseMaterialPage<T> {
  const page = parseMaterialRecord(z.object({
    items: z.array(schema), total: z.number().int().nonnegative(), page: z.number().int().positive(),
    pageSize: z.number().int().min(1).max(100),
  }).strict(), data);
  return { list: page.items, pagination: {
    page: page.page, pageSize: page.pageSize, total: page.total, totalPages: Math.ceil(page.total / page.pageSize),
  } };
}

import { WAREHOUSE_STOCKTAKE_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';

const uuid = z.uuid();
const version = z.number().int().min(1).max(2147483647);
const quantity = z.string().regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
const nonnegativeQuantity = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
const summaryAmount = z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/);

const WarehouseStocktakeOrderBaseSchema = z.object({
  id: uuid, tenant_id: uuid, warehouse_id: uuid, order_no: z.string().min(1),
  status: z.enum(WAREHOUSE_STOCKTAKE_STATUS_VALUES), version, reason: z.string().min(1).max(500),
  created_by_employee_id: uuid, updated_by_employee_id: uuid,
  created_at: z.string(), updated_at: z.string(), started_at: z.string().nullable(),
  submitted_at: z.string().nullable(), completed_at: z.string().nullable(), cancelled_at: z.string().nullable(),
}).strict();
function auditTimestampsMatchStatus(order: z.infer<typeof WarehouseStocktakeOrderBaseSchema>): boolean {
  return (order.status === 'completed') === (order.completed_at !== null)
    && (order.status === 'cancelled') === (order.cancelled_at !== null)
    && (!['counting', 'submitted', 'completed'].includes(order.status) || order.started_at !== null)
    && (!['submitted', 'completed'].includes(order.status) || order.submitted_at !== null);
}
export const WarehouseStocktakeOrderSchema = WarehouseStocktakeOrderBaseSchema.refine(auditTimestampsMatchStatus);
export const WarehouseStocktakeSummarySchema = WarehouseStocktakeOrderBaseSchema.extend({
  warehouse_name: z.string(), item_count: z.number().int().min(0).max(100),
  counted_count: z.number().int().min(0).max(100), difference_count: z.number().int().min(0).max(100),
  gain_amount: summaryAmount.nullable(), loss_amount: summaryAmount.nullable(),
}).refine(auditTimestampsMatchStatus);
export const WarehouseStocktakeItemSchema = z.object({
  id: uuid, tenant_id: uuid, stocktake_order_id: uuid, warehouse_id: uuid,
  line_no: z.number().int().min(1).max(100), supplier_sku_id: uuid,
  snapshot_at: z.string().nullable(), book_balance_id: uuid.nullable(), book_balance_version: version.nullable(),
  book_quantity: nonnegativeQuantity.nullable(), book_value: amount.nullable(), book_unit_cost: nonnegativeQuantity.nullable(),
  counted_quantity: nonnegativeQuantity.nullable(), difference_reason: z.string().min(1).max(500).nullable(),
  difference_quantity: quantity.nullable(), unit_cost: nonnegativeQuantity.nullable(), amount: amount.nullable(),
  sku_name: z.string(), sku_code: z.string(),
}).strict();
export const WarehouseStocktakeSettingsSchema = z.object({ warehouse_stocktakes_enabled: z.boolean() }).strict();
export const WarehouseStocktakeCommandResultSchema = z.object({
  status: z.enum(['saved', 'counting', 'submitted', 'completed', 'cancelled']),
  order: WarehouseStocktakeOrderSchema,
}).strict();

export interface WarehouseStocktakeActor { tenant_id: string; actor_user_id: string; actor_employee_id: string }
export interface WarehouseStocktakePageInput { page: number; pageSize: number }
export interface WarehouseStocktakePage<T> {
  list: T[];
  pagination: WarehouseStocktakePageInput & { total: number; totalPages: number };
}
export interface WarehouseStocktakeRpcClient {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export function stocktakeActorParams(input: WarehouseStocktakeActor): Record<string, unknown> {
  return { p_tenant_id: input.tenant_id, p_actor_user_id: input.actor_user_id, p_actor_employee_id: input.actor_employee_id };
}
export function parseStocktakeRecord<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.dbError('盘点数据格式错误', result.error.issues);
  return result.data;
}
export function parseStocktakePage<T>(schema: z.ZodType<T>, data: unknown): WarehouseStocktakePage<T> {
  const page = parseStocktakeRecord(z.object({ items: z.array(schema).max(100), total: z.number().int().nonnegative(),
    page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
  }).strict(), data);
  return { list: page.items, pagination: { page: page.page, pageSize: page.pageSize,
    total: page.total, totalPages: Math.ceil(page.total / page.pageSize) } };
}

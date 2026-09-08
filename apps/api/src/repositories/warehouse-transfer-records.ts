import { WAREHOUSE_TRANSFER_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { Errors } from '@/errors/error-factory';

const uuid = z.uuid();
const quantity = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
export const WarehouseTransferOrderSchema = z.object({
  id: uuid, tenant_id: uuid, source_warehouse_id: uuid, destination_warehouse_id: uuid,
  order_no: z.string().min(1), status: z.enum(WAREHOUSE_TRANSFER_STATUS_VALUES),
  version: z.number().int().positive().max(2147483647), reason: z.string().min(1).max(500),
  created_by_employee_id: uuid, updated_by_employee_id: uuid, created_at: z.string(), updated_at: z.string(),
  submitted_at: z.string().nullable(), completed_at: z.string().nullable(), cancelled_at: z.string().nullable(),
}).strict();
export const WarehouseTransferSummarySchema = WarehouseTransferOrderSchema.extend({
  source_warehouse_name: z.string(), destination_warehouse_name: z.string(), item_count: z.number().int().min(0).max(100),
  // SUM of up to 100 numeric(18,2) item amounts can need 18 integer digits.
  total_amount: z.string().regex(/^(?:0|[1-9]\d{0,17})(?:\.\d{1,2})?$/).nullable(),
});
export const WarehouseTransferItemSchema = z.object({
  id: uuid, tenant_id: uuid, transfer_order_id: uuid, source_warehouse_id: uuid, destination_warehouse_id: uuid,
  line_no: z.number().int().min(1).max(100), supplier_sku_id: uuid,
  quantity: quantity.refine((value) => /[1-9]/.test(value)), unit_cost: quantity.nullable(), amount: amount.nullable(),
  sku_name: z.string(), sku_code: z.string(),
}).strict();
export const WarehouseTransferSettingsSchema = z.object({ warehouse_transfers_enabled: z.boolean() }).strict();
export const WarehouseTransferCommandResultSchema = z.object({
  status: z.enum(['saved', 'submitted', 'completed', 'cancelled']), order: WarehouseTransferOrderSchema,
}).strict();

export interface WarehouseTransferActor { tenant_id: string; actor_user_id: string; actor_employee_id: string }
export interface WarehouseTransferPageInput { page: number; pageSize: number }
export interface WarehouseTransferPage<T> {
  list: T[];
  pagination: WarehouseTransferPageInput & { total: number; totalPages: number };
}
export interface WarehouseTransferRpcClient {
  rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export function transferActorParams(input: WarehouseTransferActor): Record<string, unknown> {
  return { p_tenant_id: input.tenant_id, p_actor_user_id: input.actor_user_id, p_actor_employee_id: input.actor_employee_id };
}
export function parseTransferRecord<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) throw Errors.dbError('调拨数据格式错误', result.error.issues);
  return result.data;
}
export function parseTransferPage<T>(schema: z.ZodType<T>, data: unknown): WarehouseTransferPage<T> {
  const page = parseTransferRecord(z.object({ items: z.array(schema).max(100), total: z.number().int().nonnegative(),
    page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
  }).strict(), data);
  return { list: page.items, pagination: { page: page.page, pageSize: page.pageSize,
    total: page.total, totalPages: Math.ceil(page.total / page.pageSize) } };
}

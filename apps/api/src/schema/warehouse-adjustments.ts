import { WAREHOUSE_ADJUSTMENT_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的调整 ID');
const expectedVersion = z.number().int().min(0).max(2147483647);
const quantityDelta = z.string()
  .regex(/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '调整数量最多 14 位整数、4 位小数')
  .refine((value) => value === value.trim(), '调整数量不能包含首尾空白')
  .refine((value) => /[1-9]/.test(value), '调整数量不能为零');
const reason = z.string().trim().min(1, '请填写调整原因').max(500, '调整原因不能超过 500 个字符');
const item = z.object({
  supplier_sku_id: uuid,
  quantity_delta: quantityDelta,
  adjustment_reason: reason,
}).strict();

export const WarehouseAdjustmentParamSchema = z.object({ id: uuid }).strict();
export const WarehouseAdjustmentDraftSchema = z.object({
  expected_version: expectedVersion,
  warehouse_id: uuid,
  reason,
  items: z.array(item).min(1).max(100).refine(
    (items) => new Set(items.map((entry) => entry.supplier_sku_id.toLowerCase())).size === items.length,
    '调整 SKU 不能重复',
  ),
}).strict();
export const WarehouseAdjustmentCommandSchema = z.object({
  expected_version: expectedVersion.min(1, '版本号必须为正整数'),
}).strict();
export const WarehouseAdjustmentListQuerySchema = PaginationQuerySchema.extend({
  warehouseId: uuid.optional(),
  status: z.enum(WAREHOUSE_ADJUSTMENT_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(100).optional(),
}).strict();
export const WarehouseAdjustmentItemsQuerySchema = PaginationQuerySchema.strict();
export const WarehouseAdjustmentSettingsQuerySchema = z.object({}).strict();

export type WarehouseAdjustmentDraftInput = z.infer<typeof WarehouseAdjustmentDraftSchema>;
export type WarehouseAdjustmentCommandInput = z.infer<typeof WarehouseAdjustmentCommandSchema>;
export type WarehouseAdjustmentListQuery = z.infer<typeof WarehouseAdjustmentListQuerySchema>;

import { WAREHOUSE_TRANSFER_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的调拨 ID');
const quantity = z.string()
  .regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '数量最多 14 位整数、4 位小数')
  .refine((value) => /[1-9]/.test(value), '数量必须大于 0');
const expectedVersion = z.number().int().min(0).max(2147483647);
const item = z.object({ supplier_sku_id: uuid, quantity }).strict();

export const WarehouseTransferParamSchema = z.object({ id: uuid }).strict();
export const WarehouseTransferDraftSchema = z.object({
  expected_version: expectedVersion,
  source_warehouse_id: uuid,
  destination_warehouse_id: uuid,
  reason: z.string().trim().min(1, '请填写调拨原因').max(500, '原因不能超过 500 个字符'),
  items: z.array(item).min(1).max(100).refine(
    (items) => new Set(items.map((entry) => entry.supplier_sku_id.toLowerCase())).size === items.length,
    '调拨 SKU 不能重复',
  ),
}).strict().refine(
  (draft) => draft.source_warehouse_id.toLowerCase() !== draft.destination_warehouse_id.toLowerCase(),
  { message: '调出仓库与调入仓库不能相同', path: ['destination_warehouse_id'] },
);
export const WarehouseTransferCommandSchema = z.object({
  expected_version: expectedVersion.min(1, '版本号必须为正整数'),
}).strict();
export const WarehouseTransferListQuerySchema = PaginationQuerySchema.extend({
  sourceWarehouseId: uuid.optional(),
  destinationWarehouseId: uuid.optional(),
  status: z.enum(WAREHOUSE_TRANSFER_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(100).optional(),
}).strict();
export const WarehouseTransferItemsQuerySchema = PaginationQuerySchema.strict();

export type WarehouseTransferDraftInput = z.infer<typeof WarehouseTransferDraftSchema>;
export type WarehouseTransferCommandInput = z.infer<typeof WarehouseTransferCommandSchema>;
export type WarehouseTransferListQuery = z.infer<typeof WarehouseTransferListQuerySchema>;

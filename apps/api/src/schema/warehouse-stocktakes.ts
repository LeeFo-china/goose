import { WAREHOUSE_STOCKTAKE_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的盘点 ID');
const draftExpectedVersion = z.number().int().min(0).max(2147483647);
const commandExpectedVersion = z.number().int().min(1).max(2147483647);
const reason = z.string().trim().min(1, '请填写盘点原因').max(500, '原因不能超过 500 个字符');
const differenceReason = z.string().trim()
  .min(1, '请填写差异原因')
  .max(500, '差异原因不能超过 500 个字符')
  .nullable()
  .optional();
const countedQuantity = z.string()
  .regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '数量最多 14 位整数、4 位小数')
  .refine((value) => value === value.trim(), '数量不能包含首尾空白');
const draftItem = z.object({ supplier_sku_id: uuid }).strict();
const countItem = z.object({
  supplier_sku_id: uuid,
  counted_quantity: countedQuantity,
  difference_reason: differenceReason,
}).strict();
const uniqueSkuItems = <T extends { supplier_sku_id: string }>(items: T[]): boolean => (
  new Set(items.map((entry) => entry.supplier_sku_id.toLowerCase())).size === items.length
);

export const WarehouseStocktakeParamSchema = z.object({ id: uuid }).strict();
export const WarehouseStocktakeDraftSchema = z.object({
  expected_version: draftExpectedVersion,
  warehouse_id: uuid,
  reason,
  items: z.array(draftItem).min(1).max(100).refine(uniqueSkuItems, '盘点 SKU 不能重复'),
}).strict();

// 服务端仍需校验选定范围、快照版本，并在差异不为 0 时要求非空差异原因。
export const WarehouseStocktakeCountsSchema = z.object({
  expected_version: commandExpectedVersion,
  items: z.array(countItem).min(1).max(100).refine(uniqueSkuItems, '盘点 SKU 不能重复'),
}).strict();

export const WarehouseStocktakeCommandSchema = z.object({
  expected_version: commandExpectedVersion,
}).strict();
export const WarehouseStocktakeListQuerySchema = PaginationQuerySchema.extend({
  warehouseId: uuid.optional(),
  status: z.enum(WAREHOUSE_STOCKTAKE_STATUS_VALUES).optional(),
  keyword: z.string().trim().max(100).optional(),
}).strict();
export const WarehouseStocktakeItemsQuerySchema = PaginationQuerySchema.strict();
export const WarehouseStocktakeSettingsQuerySchema = z.object({}).strict();

export type WarehouseStocktakeDraftInput = z.infer<typeof WarehouseStocktakeDraftSchema>;
export type WarehouseStocktakeCountsInput = z.infer<typeof WarehouseStocktakeCountsSchema>;
export type WarehouseStocktakeCommandInput = z.infer<typeof WarehouseStocktakeCommandSchema>;
export type WarehouseStocktakeListQuery = z.infer<typeof WarehouseStocktakeListQuerySchema>;

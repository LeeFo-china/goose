import { WAREHOUSE_ISSUE_STATUS_VALUES, WAREHOUSE_RETURN_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的领退料 ID');
const quantity = z.string().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/, '数量最多 14 位整数、4 位小数')
  .refine((value) => /[1-9]/.test(value), '数量必须大于 0');
const reason = z.string().trim().max(500, '原因不能超过 500 个字符').nullable().optional();
const expectedVersion = z.number().int().min(0).max(2147483647);
const issueItem = z.object({ supplier_sku_id: uuid, quantity }).strict();
const returnItem = z.object({ original_issue_item_id: uuid, quantity }).strict();

export const WarehouseMaterialParamSchema = z.object({ id: uuid }).strict();
export const WarehouseIssueDraftSchema = z.object({
  expected_version: expectedVersion,
  warehouse_id: uuid,
  project_id: uuid,
  reason,
  items: z.array(issueItem).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.supplier_sku_id.toLowerCase())).size === items.length,
    '领料 SKU 不能重复',
  ),
}).strict();
export const WarehouseReturnDraftSchema = z.object({
  expected_version: expectedVersion,
  original_issue_order_id: uuid,
  reason,
  items: z.array(returnItem).min(1).max(100).refine(
    (items) => new Set(items.map((item) => item.original_issue_item_id.toLowerCase())).size === items.length,
    '原领料明细不能重复',
  ),
}).strict();
export const WarehouseMaterialCommandSchema = z.object({
  expected_version: expectedVersion.min(1, '版本号必须为正整数'),
}).strict();
const filters = {
  warehouseId: uuid.optional(), projectId: uuid.optional(),
  keyword: z.string().trim().max(100).optional(),
};
export const WarehouseIssueListQuerySchema = PaginationQuerySchema.extend({
  ...filters, status: z.enum(WAREHOUSE_ISSUE_STATUS_VALUES).optional(),
}).strict();
export const WarehouseReturnListQuerySchema = PaginationQuerySchema.extend({
  ...filters, status: z.enum(WAREHOUSE_RETURN_STATUS_VALUES).optional(),
}).strict();
export const WarehouseMaterialItemsQuerySchema = PaginationQuerySchema.strict();
export const WarehouseMaterialProjectQuerySchema = PaginationQuerySchema.extend({
  keyword: filters.keyword,
}).strict();

export type WarehouseIssueDraftInput = z.infer<typeof WarehouseIssueDraftSchema>;
export type WarehouseReturnDraftInput = z.infer<typeof WarehouseReturnDraftSchema>;
export type WarehouseMaterialCommandInput = z.infer<typeof WarehouseMaterialCommandSchema>;
export type WarehouseMaterialListQuery = z.infer<typeof WarehouseIssueListQuerySchema>;
export type WarehouseMaterialProjectQuery = z.infer<typeof WarehouseMaterialProjectQuerySchema>;

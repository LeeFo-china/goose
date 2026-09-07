import { INVENTORY_TRANSACTION_TYPE_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的库存筛选 ID');

export const InventoryTransactionTypeSchema = z.enum(
  INVENTORY_TRANSACTION_TYPE_VALUES,
  { message: '无效的库存流水类型' },
);

export const InventoryBalanceListQuerySchema = PaginationQuerySchema.extend({
  warehouseId: uuid.optional(),
  keyword: z.string().trim().max(80, '关键词不能超过 80 个字符').optional(),
}).strict();

export const InventoryTransactionListQuerySchema =
  PaginationQuerySchema.extend({
    warehouseId: uuid.optional(),
    supplierSkuId: uuid.optional(),
    transactionType: InventoryTransactionTypeSchema.optional(),
  }).strict();

export type InventoryBalanceListQuery = z.infer<
  typeof InventoryBalanceListQuerySchema
>;
export type InventoryTransactionListQuery = z.infer<
  typeof InventoryTransactionListQuerySchema
>;

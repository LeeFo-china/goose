import { WAREHOUSE_STATUS_VALUES } from '@gooes/domain';
import { z } from 'zod';

import { PaginationQuerySchema } from './request';

const uuid = z.uuid('无效的仓库 ID');
const name = z.string().trim().min(1, '仓库名称不能为空').max(80, '仓库名称不能超过 80 个字符');
const optionalText = (max: number, message: string) =>
  z.string().trim().min(1, '字段不能为空').max(max, message).nullable().optional();
const expectedVersion = z.number().int().positive('版本号必须是正整数');
const hasUpdateField = (input: Record<string, unknown>) =>
  Object.entries(input).some(
    ([key, value]) => key !== 'expected_version' && value !== undefined,
  );

export const WarehouseStatusSchema = z.enum(WAREHOUSE_STATUS_VALUES, {
  message: '无效的仓库状态',
});

export const WarehouseListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().max(80, '关键词不能超过 80 个字符').optional(),
  status: WarehouseStatusSchema.optional(),
}).strict();

export const WarehouseParamSchema = z.object({
  id: uuid,
}).strict();

export const WarehouseCreateSchema = z.object({
  id: uuid,
  name,
  address: optionalText(200, '仓库地址不能超过 200 个字符'),
  contact_name: optionalText(50, '联系人不能超过 50 个字符'),
  contact_phone: optionalText(30, '联系电话不能超过 30 个字符'),
  manager_employee_id: uuid.nullable().optional(),
  is_default: z.boolean().default(false),
}).strict();

export const WarehouseUpdateSchema = z.object({
  expected_version: expectedVersion,
  name: name.optional(),
  address: optionalText(200, '仓库地址不能超过 200 个字符'),
  contact_name: optionalText(50, '联系人不能超过 50 个字符'),
  contact_phone: optionalText(30, '联系电话不能超过 30 个字符'),
  manager_employee_id: uuid.nullable().optional(),
  is_default: z.boolean().optional(),
  status: WarehouseStatusSchema.optional(),
}).strict().refine(hasUpdateField, {
  message: '至少需要提交一个仓库更新字段',
});

export type WarehouseListQueryInput = z.input<typeof WarehouseListQuerySchema>;
export type WarehouseParamInput = z.input<typeof WarehouseParamSchema>;
export type WarehouseCreateInput = z.input<typeof WarehouseCreateSchema>;
export type WarehouseUpdateInput = z.input<typeof WarehouseUpdateSchema>;

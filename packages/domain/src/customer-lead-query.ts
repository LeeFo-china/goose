import { z } from 'zod';

import { CUSTOMER_LEAD_SOURCE_VALUES, CUSTOMER_LEAD_STATUS_VALUES } from './customer-lead';

export const CustomerLeadPageQuerySchema = z.strictObject({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export const CustomerLeadListQuerySchema = z.strictObject({
  ...CustomerLeadPageQuerySchema.shape,
  status: z.enum(CUSTOMER_LEAD_STATUS_VALUES).optional(),
  source: z.enum(CUSTOMER_LEAD_SOURCE_VALUES).optional(),
  assigneeId: z.uuid('无效的负责人 ID').optional(),
  assignment: z.enum(['all', 'assigned', 'unassigned']).default('all'),
  dateFrom: z.iso.date('开始日期格式无效').optional(),
  dateTo: z.iso.date('结束日期格式无效').optional(),
  keyword: z.string().trim().min(1).max(80)
    .regex(/^[\p{L}\p{N}\s#号栋室-]+$/u, '关键词包含不支持的字符').optional(),
}).superRefine((input, context) => {
  if (input.dateFrom && input.dateTo && input.dateFrom > input.dateTo) {
    context.addIssue({ code: 'custom', path: ['dateTo'], message: '结束日期不能早于开始日期' });
  }
  if (input.assignment === 'unassigned' && input.assigneeId !== undefined) {
    context.addIssue({ code: 'custom', path: ['assigneeId'], message: '未分配筛选不能指定负责人' });
  }
});

export const CustomerLeadAssigneeCandidatesQuerySchema = z.strictObject({
  ...CustomerLeadPageQuerySchema.shape,
  keyword: z.preprocess(
    (value) => typeof value === 'string' && value.trim() === '' ? undefined : value,
    z.string().trim().max(100).optional(),
  ),
});
export const CustomerLeadAssigneeFilterOptionsQuerySchema =
  CustomerLeadAssigneeCandidatesQuerySchema.extend({
    includeEmployeeId: z.uuid('无效的负责人 ID').optional(),
  });
export const CustomerLeadParamsSchema = z.strictObject({
  id: z.uuid('无效的客户线索 ID'),
});
export const CustomerLeadEmptyQuerySchema = z.strictObject({});

export type CustomerLeadPageQueryInput = z.input<typeof CustomerLeadPageQuerySchema>;
export type CustomerLeadPageQuery = z.output<typeof CustomerLeadPageQuerySchema>;
export type CustomerLeadListQueryInput = z.input<typeof CustomerLeadListQuerySchema>;
export type CustomerLeadListQuery = z.output<typeof CustomerLeadListQuerySchema>;
export type CustomerLeadAssigneeCandidatesQueryInput =
  z.input<typeof CustomerLeadAssigneeCandidatesQuerySchema>;
export type CustomerLeadAssigneeCandidatesQuery =
  z.output<typeof CustomerLeadAssigneeCandidatesQuerySchema>;
export type CustomerLeadAssigneeFilterOptionsQueryInput =
  z.input<typeof CustomerLeadAssigneeFilterOptionsQuerySchema>;
export type CustomerLeadAssigneeFilterOptionsQuery =
  z.output<typeof CustomerLeadAssigneeFilterOptionsQuerySchema>;

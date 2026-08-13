import { z } from 'zod';

import { Errors } from '@/errors/error-factory';
import { maskPhone } from '@/services/platform-operators';

const AssigneeRoleSchema = z.object({
  code: z.string().regex(/^platform_/),
  name: z.string().nullable(),
}).strict();

const AssigneeRecordSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  phone: z.string().regex(/^1[3-9]\d{9}$/).nullable(),
  status: z.literal('active'),
  roles: z.array(AssigneeRoleSchema).min(1),
}).strict();

const PaginationSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().min(1).max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
}).strict().refine(
  ({ pageSize, total, totalPages }) =>
    totalPages === (total === 0 ? 0 : Math.ceil(total / pageSize)),
);

const AssigneePageSchema = z.object({
  list: z.array(AssigneeRecordSchema),
  includedEmployee: AssigneeRecordSchema.nullable(),
  pagination: PaginationSchema,
}).strict().superRefine(({ list, pagination }, context) => {
  if (list.length > pagination.pageSize || list.length > pagination.total) {
    context.addIssue({
      code: 'custom',
      path: ['list'],
      message: '候选分页记录数不一致',
    });
  }
  if (new Set(list.map(({ id }) => id)).size !== list.length) {
    context.addIssue({
      code: 'custom',
      path: ['list'],
      message: '候选员工重复',
    });
  }
});

type AssigneeRecord = z.infer<typeof AssigneeRecordSchema>;

export type AssigneeCandidatePageView = {
  list: Array<{
    id: string;
    name: string | null;
    phone_masked: string | null;
    status: 'active';
    roles: Array<{ code: string; name: string | null }>;
    selectable: boolean;
    historical: boolean;
  }>;
  pagination: z.infer<typeof PaginationSchema>;
};

export function serializeAssigneeCandidatePage(
  page: unknown,
  includedEmployeeId: string | undefined,
): AssigneeCandidatePageView {
  const parsed = AssigneePageSchema.safeParse(page);
  if (!parsed.success) {
    throw Errors.dbError('平台跟进人候选数据格式错误');
  }
  if (
    parsed.data.includedEmployee
    && parsed.data.includedEmployee.id !== includedEmployeeId
  ) {
    throw Errors.dbError('平台跟进人候选数据格式错误');
  }

  const seenEmployeeIds = new Set(parsed.data.list.map(({ id }) => id));
  const records = [...parsed.data.list];
  if (
    parsed.data.includedEmployee
    && !seenEmployeeIds.has(parsed.data.includedEmployee.id)
  ) {
    records.push(parsed.data.includedEmployee);
  }

  return {
    list: records.map(serializeAssigneeCandidate),
    pagination: parsed.data.pagination,
  };
}

function serializeAssigneeCandidate(record: AssigneeRecord) {
  return {
    id: record.id,
    name: record.name,
    phone_masked: maskPhone(record.phone),
    status: record.status,
    roles: [...record.roles].sort(compareRoles),
    selectable: true,
    historical: false,
  };
}

function compareRoles(
  left: AssigneeRecord['roles'][number],
  right: AssigneeRecord['roles'][number],
): number {
  if (left.code !== right.code) return left.code < right.code ? -1 : 1;
  const leftName = left.name ?? '';
  const rightName = right.name ?? '';
  if (leftName === rightName) return 0;
  return leftName < rightName ? -1 : 1;
}

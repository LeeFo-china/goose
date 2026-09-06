import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  CUSTOMER_LEAD_ACTION_PERMISSIONS, CUSTOMER_LEAD_ERROR_CONFIG,
  CUSTOMER_LEAD_SOURCE_VALUES, CustomerLeadAssignSchema,
  CustomerLeadCommandResultSchema, CustomerLeadConvertSchema,
  CustomerLeadFollowUpSchema, CustomerLeadListQuerySchema,
  CustomerLeadMarkInvalidSchema, CustomerLeadAssigneeCandidatesQuerySchema,
  CustomerLeadAssigneeFilterOptionsQuerySchema, CustomerLeadPageQuerySchema,
  PermissionCodeConfig, PERMISSION_CODE_VALUES,
} from '../packages/domain/src/index';

// Offline contract smoke: no API calls, database writes, tokens or client builds.
const id = '11111111-1111-4111-8111-111111111111';
const command = { expected_lead_version: 1, idempotency_key: id };
const followUp = { ...command, follow_up_type: 'phone', summary: '联系客户', result: '预约回访' };
let checks = 0;
function check(condition: boolean, message: string): void {
  assert.ok(condition, message);
  checks += 1;
}

assert.deepEqual(CustomerLeadListQuerySchema.parse({}), {
  page: 1, pageSize: 20, assignment: 'all',
});
checks += 1;
for (const pageSchema of [CustomerLeadListQuerySchema, CustomerLeadPageQuerySchema,
  CustomerLeadAssigneeCandidatesQuerySchema, CustomerLeadAssigneeFilterOptionsQuerySchema]) {
  check(pageSchema.safeParse({ page: '2', pageSize: '100' }).success, 'query strings are accepted');
  for (const query of [{ page: 0 }, { pageSize: 101 }, { page: 10001 }, { tenant_id: id }]) {
    check(!pageSchema.safeParse(query).success, 'pagination and tenant boundary');
  }
}
for (const query of [
  { assignment: 'unassigned', assigneeId: id },
  { dateFrom: '2026-09-07', dateTo: '2026-09-06' },
  { source: 'xiaohongshu' }, { source: 'platform' }, { keyword: '%_' },
]) check(!CustomerLeadListQuerySchema.safeParse(query).success, 'invalid filter rejected');
check(CustomerLeadListQuerySchema.safeParse({ source: 'douyin_miniapp', assignment: 'unassigned' }).success,
  'integrated source and independent unassigned filter');
const normal = CustomerLeadFollowUpSchema.parse(followUp);
check(normal.appointment_id === null && normal.appointment_status === null
  && normal.confirmed_visit_at === null, 'ordinary follow-up requires no appointment');
for (const input of [
  { ...followUp, appointment_status: 'confirmed', confirmed_visit_at: '2026-09-07T10:00:00+08:00' },
  { ...followUp, appointment_id: id, appointment_status: 'confirmed' },
  { ...followUp, confirmed_visit_at: '2026-09-07T10:00:00+08:00' },
  { ...followUp, appointment_status: 'completed' },
  { ...followUp, summary: ' ' }, { ...followUp, result: ' ' },
  { ...followUp, source: 'douyin_miniapp' },
]) check(!CustomerLeadFollowUpSchema.safeParse(input).success, 'invalid follow-up rejected');
check(CustomerLeadFollowUpSchema.safeParse({ ...followUp, appointment_id: id,
  appointment_status: 'confirmed', confirmed_visit_at: '2026-09-07T10:00:00+08:00' }).success,
'appointment confirmation accepted');
for (const [schema, input] of [
  [CustomerLeadAssignSchema, { ...command, assigned_employee_id: id }],
  [CustomerLeadConvertSchema, command],
  [CustomerLeadMarkInvalidSchema, { ...command, reason: '超出服务范围' }],
] as const) {
  check(schema.safeParse(input).success, 'valid command');
  for (const extra of [{ tenant_id: id }, { customer_id: id },
    { expected_lead_version: 0 }, { expected_lead_version: 2147483648 },
    { idempotency_key: 'invalid' }]) {
    check(!schema.safeParse({ ...input, ...extra }).success, 'command boundary');
  }
}
const result = { action: 'follow_up', result: 'followed_up', lead_id: id,
  lead_version: 2, idempotent: false, follow_up_id: id, appointment_id: null,
  appointment_version: null, appointment_status: null };
check(CustomerLeadCommandResultSchema.safeParse(result).success, 'ordinary follow-up result');
check(!CustomerLeadCommandResultSchema.safeParse({ ...result, appointment_version: 2 }).success,
  'partial appointment result rejected');
const conversion = { action: 'convert', result: 'converted', lead_id: id, lead_version: 2,
  idempotent: false, customer_id: null, can_view_customer: false,
  created_customer: true, repeated_conversion: false, appointments_updated: 0 };
check(CustomerLeadCommandResultSchema.safeParse(conversion).success, 'hidden customer conversion result');
check(!CustomerLeadCommandResultSchema.safeParse({ ...conversion, customer_id: id }).success,
  'customer ID cannot bypass view permission');
check(!CustomerLeadCommandResultSchema.safeParse({ ...conversion, repeated_conversion: true }).success,
  'repeated conversion cannot create another customer');
assert.deepEqual(CUSTOMER_LEAD_SOURCE_VALUES, ['douyin_miniapp', 'h5']);
checks += 1;
for (const action of ['read', 'assign', 'follow_up', 'convert'] as const) {
  const code = `customer_lead.${action}` as const;
  check(PERMISSION_CODE_VALUES.includes(code), 'new permission registered');
  check(PermissionCodeConfig[code].module === 'customer_lead', 'independent permission module');
  check(PERMISSION_CODE_VALUES.includes(`douyin_lead.${action}`), 'legacy permission preserved');
}
check(CUSTOMER_LEAD_ACTION_PERMISSIONS.mark_invalid === 'customer_lead.convert', 'invalidation permission');
check(CUSTOMER_LEAD_ERROR_CONFIG.CUSTOMER_LEAD_VERSION_CONFLICT.statusCode === 409, 'version conflict contract');
check(CUSTOMER_LEAD_ERROR_CONFIG.CUSTOMER_LEAD_IDEMPOTENCY_CONFLICT.statusCode === 409, 'replay conflict contract');

const migration = readFileSync(new URL(
  '../supabase/migrations/20260906040943_tenant_customer_lead_permissions.sql', import.meta.url,
), 'utf8');
check(migration.includes("roles.code = 'system_admin'")
  && migration.includes('roles.tenant_id IS NOT NULL')
  && migration.includes("roles.status = 'active'"), 'seed grants limited to active tenant admins');
check(!/\b(?:UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/.test(migration.replace(/--.*$/gm, '')),
  'additive seed does not alter legacy data or grants');
console.log(`customer lead foundation: ${checks} offline checks passed`);

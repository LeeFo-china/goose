import type { AuthContext } from '@/services/authorization';

export const TRANSFER_ID = '10000000-0000-4000-8000-000000000001';
export const DESTINATION_ID = '20000000-0000-4000-8000-000000000001';
export const TRANSFER_ACTOR = { tenant_id: TRANSFER_ID, actor_user_id: TRANSFER_ID, actor_employee_id: TRANSFER_ID };
export const TRANSFER_ORDER = {
  id: TRANSFER_ID, tenant_id: TRANSFER_ID, source_warehouse_id: TRANSFER_ID, destination_warehouse_id: DESTINATION_ID,
  order_no: 'WT-0000000001', status: 'draft' as const, version: 1, reason: '分仓补料',
  created_by_employee_id: TRANSFER_ID, updated_by_employee_id: TRANSFER_ID,
  created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z',
  submitted_at: null, completed_at: null, cancelled_at: null,
};
export const TRANSFER_SUMMARY = { ...TRANSFER_ORDER, source_warehouse_name: '主仓', destination_warehouse_name: '分仓', item_count: 1, total_amount: null };
export const TRANSFER_ITEM = {
  id: TRANSFER_ID, tenant_id: TRANSFER_ID, transfer_order_id: TRANSFER_ID,
  source_warehouse_id: TRANSFER_ID, destination_warehouse_id: DESTINATION_ID,
  line_no: 1, supplier_sku_id: TRANSFER_ID, quantity: '99999999999999.9999',
  unit_cost: '0.0001', amount: '10000000000.00', sku_name: '木板', sku_code: 'SKU-1',
};
export const TRANSFER_DRAFT = { expected_version: 0, source_warehouse_id: TRANSFER_ID,
  destination_warehouse_id: DESTINATION_ID, reason: '分仓补料', items: [{ supplier_sku_id: TRANSFER_ID, quantity: '0.0001' }] };
export function transferAuth(permissions: string[]): AuthContext {
  return { authUserId: TRANSFER_ID, employeeId: TRANSFER_ID, tenantId: TRANSFER_ID,
    tenantName: null, tenantSlug: null, tenantStatus: 'active', isPlatformAdmin: false,
    employeeName: '仓管员', employeeStatus: 'active', departmentId: null, tenantDepartmentId: null,
    departmentCode: null, departmentName: null, postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
    permissions: permissions.map((code) => ({ code, scope: 'self' as const })) };
}

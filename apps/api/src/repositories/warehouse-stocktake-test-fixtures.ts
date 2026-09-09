import type { AuthContext } from '@/services/authorization';

export const STOCKTAKE_ID = '10000000-0000-4000-8000-000000000001';
export const STOCKTAKE_ACTOR = { tenant_id: STOCKTAKE_ID, actor_user_id: STOCKTAKE_ID, actor_employee_id: STOCKTAKE_ID };
export const STOCKTAKE_ORDER = { id: STOCKTAKE_ID, tenant_id: STOCKTAKE_ID, warehouse_id: STOCKTAKE_ID,
  order_no: 'WS-0000000001', status: 'draft' as const, version: 1, reason: '月末盘点',
  created_by_employee_id: STOCKTAKE_ID, updated_by_employee_id: STOCKTAKE_ID,
  created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z', started_at: null,
  submitted_at: null, completed_at: null, cancelled_at: null };
export const STOCKTAKE_SUMMARY = { ...STOCKTAKE_ORDER, warehouse_name: '主仓', item_count: 1,
  counted_count: 0, difference_count: 0, gain_amount: null, loss_amount: null };
export const STOCKTAKE_ITEM = { id: STOCKTAKE_ID, tenant_id: STOCKTAKE_ID, stocktake_order_id: STOCKTAKE_ID,
  warehouse_id: STOCKTAKE_ID, line_no: 1, supplier_sku_id: STOCKTAKE_ID, snapshot_at: null,
  book_balance_id: null, book_balance_version: null, book_quantity: null, book_value: null,
  book_unit_cost: null, counted_quantity: null, difference_reason: null, difference_quantity: null,
  unit_cost: null, amount: null, sku_name: '木板', sku_code: 'SKU-1' };
export const STOCKTAKE_DRAFT = { expected_version: 0, warehouse_id: STOCKTAKE_ID, reason: '月末盘点',
  items: [{ supplier_sku_id: STOCKTAKE_ID }] };
export const STOCKTAKE_COUNTS = { expected_version: 1,
  items: [{ supplier_sku_id: STOCKTAKE_ID, counted_quantity: '0', difference_reason: null }] };
export function stocktakeAuth(permissions: string[]): AuthContext {
  return { authUserId: STOCKTAKE_ID, employeeId: STOCKTAKE_ID, tenantId: STOCKTAKE_ID,
    tenantName: null, tenantSlug: null, tenantStatus: 'active', isPlatformAdmin: false,
    employeeName: '仓管员', employeeStatus: 'active', departmentId: null, tenantDepartmentId: null,
    departmentCode: null, departmentName: null, postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
    permissions: permissions.map((code) => ({ code, scope: 'self' as const })) };
}

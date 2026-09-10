// Synthetic HTTP contract data only. Never touches a database.
import { randomUUID } from 'node:crypto';
import { balances, warehouses, session as inventorySession, now, tenantId, employeeId } from './inventory-mock-fixture.mjs';
export { balances, warehouses, now, tenantId, employeeId };
export const uuid = (n) => `98abcdef-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function session(persona) {
  const original = inventorySession('all');
  const permissions = persona === 'denied' ? [] : ['inventory.stock.view'];
  if (persona !== 'read' && persona !== 'denied') permissions.push('inventory.warehouse.view');
  if (['all', 'manage', 'other-user', 'other-tenant', 'other-employee'].includes(persona)) permissions.push('inventory.stocktake.manage');
  if (['all', 'approve'].includes(persona)) permissions.push('inventory.stocktake.approve');
  return { ...original, token: `stocktakes-${persona}`, permissions: permissions.map(code => ({ code, scope: 'all' })),
    user_id: persona === 'other-user' ? uuid(91) : original.user_id,
    tenant: { ...original.tenant, id: persona === 'other-tenant' ? uuid(92) : tenantId },
    employee: { ...original.employee, id: persona === 'other-employee' ? uuid(93) : employeeId } };
}
export function item(order, index) {
  const sku = balances[index], frozen = order.status !== 'draft';
  return { id: randomUUID(), tenant_id: tenantId, stocktake_order_id: order.id,
    warehouse_id: order.warehouse_id, line_no: index + 1, supplier_sku_id: sku.supplier_sku_id,
    sku_name: sku.sku_name, sku_code: sku.sku_code, snapshot_at: frozen ? now : null,
    book_balance_id: frozen ? sku.id : null, book_balance_version: frozen ? 1 : null,
    book_quantity: frozen ? '10.0000' : null, book_value: frozen ? '80.00' : null,
    book_unit_cost: frozen ? '8.0000' : null, counted_quantity: frozen ? '10.0000' : null,
    difference_quantity: frozen ? '0.0000' : null, difference_reason: null,
    unit_cost: order.status === 'completed' ? '8.0000' : null, amount: order.status === 'completed' ? '0.00' : null };
}
export function seed() {
  const orders = Array.from({ length: 25 }, (_, i) => ({ id: uuid(100 + i), tenant_id: tenantId,
    warehouse_id: warehouses[0].id, warehouse_name: warehouses[0].name, order_no: `PD${String(i + 1).padStart(4, '0')}`,
    status: i === 0 ? 'completed' : i === 2 ? 'submitted' : 'draft', version: 1, reason: '浏览器盘点验收',
    created_by_employee_id: employeeId, updated_by_employee_id: employeeId, created_at: now, updated_at: now,
    started_at: i === 0 || i === 2 ? now : null, submitted_at: i === 0 || i === 2 ? now : null,
    completed_at: i === 0 ? now : null, cancelled_at: null, item_count: i === 1 ? 25 : 1,
    counted_count: i === 0 || i === 2 ? 1 : 0, difference_count: 0,
    gain_amount: i === 0 ? '0.00' : null, loss_amount: i === 0 ? '0.00' : null }));
  return { orders, lines: new Map(orders.map(order => [order.id, Array.from({ length: order.item_count }, (_, i) => item(order, i))])) };
}
export function decimalUnits(value) { const [a, b = ''] = value.split('.'); return BigInt(a) * 10000n + BigInt(b.padEnd(4, '0')); }
export function decimalString(value, scale = 10000n, digits = 4) {
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? '-' : ''}${absolute / scale}.${String(absolute % scale).padStart(digits, '0')}`;
}

// Browser UI contract fixtures only; no database or external API is involved.
export const now = '2026-09-07T01:00:00.000Z';
const uuid = (number) =>
  `77000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
export const tenantId = uuid(1);
export const employeeId = uuid(2);
export const warehouses = Array.from({ length: 25 }, (_, index) => ({
  id: uuid(100 + index),
  tenant_id: tenantId,
  warehouse_code: `WH${index + 1}`,
  name: `仓库${String(index + 1).padStart(2, '0')}`,
  address: null,
  contact_name: null,
  contact_phone: null,
  manager_employee_id: null,
  is_default: index === 0,
  status: index === 24 ? 'inactive' : 'active',
  version: 1,
  created_at: now,
  updated_at: now,
}));
export const balances = Array.from({ length: 45 }, (_, index) => {
  const warehouse = warehouses[index % warehouses.length];
  return {
    id: uuid(200 + index),
    tenant_id: tenantId,
    warehouse_id: warehouse.id,
    warehouse_name: warehouse.name,
    supplier_sku_id: uuid(300 + index),
    sku_code: `LED-${String(index + 1).padStart(2, '0')}`,
    sku_name: `节能灯${String(index + 1).padStart(2, '0')}`,
    specification: '暖白',
    model: 'A型',
    quantity_on_hand: '10.0000',
    inventory_value: '81.25',
    average_unit_cost: '8.1250',
    version: 1,
    updated_at: now,
  };
});
export const transactions = balances.map((balance, index) => ({
  id: uuid(400 + index),
  tenant_id: tenantId,
  warehouse_id: balance.warehouse_id,
  warehouse_name: balance.warehouse_name,
  supplier_sku_id: balance.supplier_sku_id,
  sku_code: balance.sku_code,
  sku_name: balance.sku_name,
  transaction_type: 'purchase_receipt',
  quantity_delta: index === 0 ? '12.0000' : '10.0000',
  unit_cost: '8.1250',
  value_delta: index === 0 ? '97.50' : '81.25',
  source_type: 'supplier_purchase_receipt_item',
  source_id: uuid(800 + index),
  source_document:
    index === 1
      ? null
      : {
          receipt_id: uuid(500 + index),
          receipt_no: `RK${String(index + 1).padStart(4, '0')}`,
          purchase_order_id: uuid(600 + index),
          order_no: `CG${String(index + 1).padStart(4, '0')}`,
        },
  project_id: null,
  cost_category_id: null,
  occurred_at: now,
  created_by_employee_id: employeeId,
  created_by_employee_name: '库存操作员',
  created_at: now,
}));
transactions.push({
  ...transactions[0],
  id: uuid(700),
  transaction_type: 'adjustment_out',
  quantity_delta: '-2.0000',
  value_delta: '-16.25',
  source_type: 'inventory_adjustment',
  source_id: uuid(701),
  source_document: null,
});

export function session(persona) {
  const permissions = persona === 'denied' ? [] : ['inventory.stock.view'];
  if (persona === 'stock-order')
    permissions.push('supplier.purchase-order.view');
  if (persona === 'all')
    permissions.push(
      'inventory.warehouse.view',
      'supplier.purchase-order.view',
    );
  return {
    user_id: uuid(3),
    login_channel: 'admin_web',
    employee: {
      id: employeeId,
      name: '库存验收员工',
      phone: '18800000001',
      status: 'active',
      tenant_department_id: null,
      department_name: '仓储部',
      post_id: null,
      post_name: '仓管员',
      avatar: null,
    },
    tenant: {
      id: tenantId,
      name: '库存浏览器验收企业',
      slug: 'inventory-e2e',
      status: 'active',
    },
    roles: ['employee'],
    permissions: permissions.map((code) => ({ code, scope: 'all' })),
    token: `inventory-${persona}-token`,
    expires_at: '2099-12-31T23:59:59.000Z',
  };
}

export const serviceAccess = {
  accessStatus: 'workspace_available',
  accessMode: 'paid',
  accessLevel: 'read_write',
  canEnterWorkspace: true,
  readonly: false,
  trialId: null,
  trialStatus: null,
  startsAt: null,
  endsAt: null,
  evaluatedAt: now,
  title: '平台技术服务可用',
  message: '当前企业可正常使用工作台。',
  primaryAction: { key: 'enter_workspace', label: '进入工作台' },
  secondaryAction: null,
};

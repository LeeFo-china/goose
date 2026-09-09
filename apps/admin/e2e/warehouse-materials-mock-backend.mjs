// Synthetic HTTP contract fixture only. No SQL, database, or external writes.
import { createServer } from 'node:http';
import {
  warehouses,
  balances,
  session as inventorySession,
  serviceAccess,
  now,
  tenantId,
  employeeId,
} from './inventory-mock-fixture.mjs';

const uuid = (number) =>
  `88abcdef-0000-4000-8000-${String(number).padStart(12, '0')}`;
const projects = Array.from({ length: 25 }, (_, index) => ({
  id: uuid(index + 1),
  name: `项目${index + 1}`,
}));
let scenario = 'normal';
let orders = [];
let lines = new Map();
let replays = new Map();
let journal = [];
let failed = false;
let refreshFailure = false;
function seed() {
  orders = Array.from({ length: 25 }, (_, index) => ({
    id: uuid(100 + index),
    tenant_id: tenantId,
    warehouse_id: warehouses[0].id,
    project_id: projects[0].id,
    order_no: `LL${String(index + 1).padStart(4, '0')}`,
    version: 1,
    status: index === 0 ? 'completed' : 'draft',
    reason: '验收材料',
    created_by_employee_id: employeeId,
    updated_by_employee_id: employeeId,
    created_at: now,
    updated_at: now,
    completed_at: index === 0 ? now : null,
    cancelled_at: null,
    submitted_at: null,
    document_type: 'issue',
    warehouse_name: warehouses[0].name,
    project_name: projects[0].name,
    total_amount: index === 0 ? '80.00' : null,
    item_count: index === 1 ? 25 : 1,
  }));
  lines = new Map(
    orders.map((order) => [
      order.id,
      Array.from({ length: order.item_count }, (_, index) =>
        makeItem(
          order,
          { supplier_sku_id: balances[index].supplier_sku_id, quantity: '10' },
          index,
        ),
      ),
    ]),
  );
}
function makeItem(order, line, index) {
  const sku =
    balances.find((row) => row.supplier_sku_id === line.supplier_sku_id) ??
    balances[0];
  const original =
    line.original_issue_item_id &&
    [...lines.values()]
      .flat()
      .find((row) => row.id === line.original_issue_item_id);
  return {
    id: `${order.id.slice(0, 24)}${order.id.slice(-8)}${String(index + 1).padStart(4, '0')}`,
    tenant_id: tenantId,
    warehouse_id: order.warehouse_id,
    project_id: order.project_id,
    line_no: index + 1,
    supplier_sku_id: original?.supplier_sku_id ?? sku.supplier_sku_id,
    sku_name: original?.sku_name ?? sku.sku_name,
    sku_code: original?.sku_code ?? sku.sku_code,
    quantity: line.quantity,
    unit_cost: order.status === 'completed' ? '8.0000' : null,
    amount: order.status === 'completed' ? '80.00' : null,
    cost_category_id: order.status === 'completed' ? uuid(80) : null,
    cost_category_name: order.status === 'completed' ? '材料成本' : null,
    original_issued_quantity: original?.quantity ?? line.quantity,
    original_issued_amount: '80.00',
    returned_quantity: '0',
    returned_amount: '0.00',
    returnable_quantity: original?.quantity ?? line.quantity,
    ...(order.document_type === 'issue'
      ? { issue_order_id: order.id }
      : {
          return_order_id: order.id,
          original_issue_order_id: order.original_issue_order_id,
          original_issue_item_id: line.original_issue_item_id,
        }),
  };
}
// Fixture pricing is a fixed 8/unit, only to keep displayed sample facts coherent.
function quantityUnits(value) {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
function decimal(units, scale) {
  const base = 10n ** BigInt(scale);
  return `${units / base}.${String(units % base).padStart(scale, '0')}`;
}
const amountCents = (value) => (quantityUnits(value) * 800n + 5000n) / 10000n;
function completeOrder(order) {
  order.status = 'completed';
  order.total_amount = decimal(
    (lines.get(order.id) || []).reduce(
      (sum, line) => sum + amountCents(line.quantity),
      0n,
    ),
    2,
  );
  lines.set(
    order.id,
    (lines.get(order.id) || []).map((line) => ({
      ...line,
      unit_cost: '8.0000',
      amount: decimal(amountCents(line.quantity), 2),
      cost_category_name: '材料成本',
    })),
  );
  for (const issue of orders.filter((row) => row.document_type === 'issue')) {
    for (const original of lines.get(issue.id) || []) {
      const returned = orders
        .filter(
          (row) =>
            row.document_type === 'return' &&
            row.original_issue_order_id === issue.id &&
            row.status === 'completed',
        )
        .flatMap((row) => lines.get(row.id) || [])
        .filter((row) => row.original_issue_item_id === original.id);
      const quantity = returned.reduce(
        (sum, row) => sum + quantityUnits(row.quantity),
        0n,
      );
      const facts = {
        returned_quantity: decimal(quantity, 4),
        returned_amount: decimal(
          returned.reduce((sum, row) => sum + amountCents(row.quantity), 0n),
          2,
        ),
        returnable_quantity: decimal(
          quantityUnits(original.quantity) - quantity,
          4,
        ),
      };
      Object.assign(original, facts);
      for (const row of returned) Object.assign(row, facts);
    }
  }
}
seed();
const send = (res, payload, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
};
const data = (res, value) => send(res, { success: true, data: value });
const error = (res, status, message, code = 'WAREHOUSE_MATERIAL_INVALID') =>
  send(res, { success: false, message, code }, status);
async function body(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function page(res, url, rows) {
  const current = Number(url.searchParams.get('page') || 1),
    size = Number(url.searchParams.get('pageSize') || 20);
  if (size < 1 || size > 100) return error(res, 400, '分页超限');
  return data(res, {
    list: rows.slice((current - 1) * size, current * size),
    pagination: {
      page: current,
      pageSize: size,
      total: rows.length,
      totalPages: Math.ceil(rows.length / size),
    },
  });
}
function session(persona) {
  const value = inventorySession('all');
  const permissions =
    persona === 'denied' ? [] : ['inventory.stock.view', 'project.read'];
  if (persona !== 'read' && persona !== 'denied')
    permissions.push('inventory.warehouse.view');
  if (persona === 'all' || persona === 'manage')
    permissions.push('inventory.issue.manage');
  if (persona === 'all' || persona === 'approve')
    permissions.push('inventory.issue.approve');
  return {
    ...value,
    permissions: permissions.map((code) => ({ code, scope: 'all' })),
    token: `materials-${persona}`,
    user_id: persona === 'other' ? uuid(99) : value.user_id,
  };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3997');
    const path = url.pathname;
    if (path === '/health') return data(res, { ready: true });
    if (path === '/__test/reset') {
      scenario = (await body(req)).scenario || 'normal';
      failed = false;
      refreshFailure = false;
      journal = [];
      replays = new Map();
      seed();
      return data(res, {});
    }
    if (path === '/__test/requests') return send(res, journal);
    if (path === '/__test/recover-reads') {
      refreshFailure = false;
      return data(res, { recovered: true });
    }
    if (path === '/admin/auth/login')
      return data(res, session((await body(req)).phone));
    const persona = req.headers.authorization?.replace('Bearer materials-', '');
    if (!persona) return error(res, 401, '请登录');
    if (path === '/admin/auth/me') return data(res, session(persona));
    if (path === '/employee/service-access') return data(res, serviceAccess);
    const entry = {
      path: `${path}${url.search}`,
      method: req.method,
      key: req.headers['idempotency-key'],
      completed: false,
    };
    journal.push(entry);
    res.on('finish', () => {
      entry.completed = true;
    });
    if (path === '/warehouse-issues/settings') {
      if (scenario === 'settings-error') return error(res, 503, '配置读取失败');
      if (scenario === 'settings-invalid') return data(res, {});
      return data(res, { warehouse_materials_enabled: scenario !== 'off' });
    }
    if (path === '/warehouses')
      return page(
        res,
        url,
        warehouses.filter((row) => row.status === 'active'),
      );
    if (path === '/warehouse-issues/project-options')
      return page(
        res,
        url,
        projects.filter((row) =>
          row.name.includes(url.searchParams.get('keyword') || ''),
        ),
      );
    if (path === '/inventory/balances')
      return page(
        res,
        url,
        balances.map((row) => ({ ...row, warehouse_id: warehouses[0].id })),
      );
    if (path === '/inventory/transactions')
      return page(res, url, [
        {
          ...balances[0],
          transaction_type: 'project_issue',
          quantity_delta: '-10',
          value_delta: '-80',
          occurred_at: now,
          created_by_employee_name: '验收员工',
          source_document: {
            issue_order_id: orders[0].id,
            issue_order_no: orders[0].order_no,
          },
        },
      ]);
    const match = path.match(
      /^\/warehouse-(issues|returns)(?:\/([^/]+))?(?:\/(items|save-draft|submit|complete|cancel))?$/,
    );
    if (!match) return error(res, 404, `未配置的验收接口 ${path}`);
    const [, plural, rawId, action] = match;
    const id = rawId?.toLowerCase();
    const kind = plural === 'issues' ? 'issue' : 'return';
    if (!id) {
      const keyword = url.searchParams.get('keyword') || '';
      if (keyword === '慢响应')
        await new Promise((resolve) => setTimeout(resolve, 1200));
      return page(
        res,
        url,
        orders.filter(
          (order) =>
            order.document_type === kind &&
            (!keyword ||
              order.order_no.includes(keyword) ||
              (order.reason || '').includes(keyword)) &&
            (!url.searchParams.get('status') ||
              order.status === url.searchParams.get('status')) &&
            (!url.searchParams.get('projectId') ||
              order.project_id === url.searchParams.get('projectId')) &&
            (!url.searchParams.get('warehouseId') ||
              order.warehouse_id === url.searchParams.get('warehouseId')),
        ),
      );
    }
    let order = orders.find((row) => row.id === id);
    if (req.method === 'GET') {
      if (refreshFailure) {
        return error(res, 503, '成功后读取失败');
      }
      if (!order) return error(res, 404, '单据不存在');
      if (action === 'items') return page(res, url, lines.get(id) || []);
      return data(res, order);
    }
    entry.body = await body(req);
    if (!entry.key) return error(res, 400, '缺少请求标识');
    if (scenario === 'retry-denied' && failed)
      return error(res, 403, '重试权限已撤销');
    if (replays.has(entry.key)) return data(res, replays.get(entry.key));
    if (scenario === 'conflict' && !failed && order) {
      failed = true;
      order.version++;
      return error(
        res,
        409,
        '版本已变化，请重新确认',
        'WAREHOUSE_MATERIAL_VERSION_CONFLICT',
      );
    }
    if (entry.body.expected_version !== (order?.version || 0))
      return error(res, 409, '版本冲突', 'WAREHOUSE_MATERIAL_VERSION_CONFLICT');
    if (action === 'save-draft') {
      const source = orders.find(
        (row) => row.id === entry.body.original_issue_order_id,
      );
      order ??= {
        ...orders[1],
        id,
        order_no: `${kind === 'issue' ? 'LL' : 'TL'}NEW`,
        version: 0,
        document_type: kind,
        status: 'draft',
        warehouse_id: source?.warehouse_id ?? entry.body.warehouse_id,
        project_id: source?.project_id ?? entry.body.project_id,
        original_issue_order_id: source?.id,
        original_issue_order_no: source?.order_no,
      };
      if (!orders.some((row) => row.id === id)) orders.unshift(order);
      order.reason = entry.body.reason;
      order.item_count = entry.body.items.length;
      lines.set(
        id,
        entry.body.items.map((line, index) => makeItem(order, line, index)),
      );
    } else if (action === 'submit') order.status = 'submitted';
    else if (action === 'complete') completeOrder(order);
    else if (action === 'cancel') order.status = 'cancelled';
    order.version++;
    const result = structuredClone({
      status: action === 'save-draft' ? 'saved' : order.status,
      order,
    });
    replays.set(entry.key, result);
    if (scenario === 'invalid-success' && !failed) {
      failed = true;
      return send(res, {});
    }
    if (
      ['unknown', 'retry-denied', 'rate-limit'].includes(scenario) &&
      !failed
    ) {
      failed = true;
      return error(res, scenario === 'rate-limit' ? 429 : 503, '请求结果未知');
    }
    if (scenario === 'refresh-error' && !failed) {
      failed = true;
      refreshFailure = true;
    }
    return data(res, result);
  } catch (caught) {
    error(res, 500, caught instanceof Error ? caught.message : '验收错误');
  }
});
server.listen(3997, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));

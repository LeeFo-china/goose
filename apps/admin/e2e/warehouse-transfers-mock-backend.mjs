// Synthetic UI contract fixture. No database or external mutations.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { warehouses, balances, session as inventorySession, serviceAccess, now, tenantId, employeeId } from './inventory-mock-fixture.mjs';

const uuid = (n) => `99abcdef-0000-4000-8000-${String(n).padStart(12, '0')}`;
let scenario = 'normal', failed = false, orders = [], journal = [], lines = new Map(), receipts = new Map();
function item(order, skuIndex, quantity = '2.0001') {
  const sku = balances[skuIndex];
  return { id: randomUUID(), tenant_id: tenantId,
    transfer_order_id: order.id, source_warehouse_id: order.source_warehouse_id,
    destination_warehouse_id: order.destination_warehouse_id, line_no: skuIndex + 1,
    supplier_sku_id: sku.supplier_sku_id, sku_name: sku.sku_name, sku_code: sku.sku_code,
    quantity, unit_cost: order.status === 'completed' ? '8.0000' : null,
    amount: order.status === 'completed' ? '16.00' : null };
}
function seed() {
  orders = Array.from({ length: 25 }, (_, i) => ({ id: uuid(100 + i), tenant_id: tenantId,
    source_warehouse_id: warehouses[0].id, destination_warehouse_id: warehouses[1].id,
    source_warehouse_name: warehouses[0].name, destination_warehouse_name: warehouses[1].name,
    order_no: `DB${String(i + 1).padStart(4, '0')}`, status: i === 0 ? 'completed' : 'draft', version: 1,
    reason: '浏览器调拨验收', created_by_employee_id: employeeId, updated_by_employee_id: employeeId,
    created_at: now, updated_at: now, submitted_at: null, completed_at: i === 0 ? now : null,
    cancelled_at: null, item_count: i === 1 ? 25 : 1, total_amount: i === 0 ? '16.00' : null }));
  lines = new Map(orders.map(order => [order.id, Array.from({ length: order.item_count }, (_, i) => item(order, i))]));
}
seed();
const send = (res, value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const data = (res, value) => send(res, { success: true, data: value });
const error = (res, status, message, code = 'WAREHOUSE_TRANSFER_INVALID') => send(res, { success: false, message, code }, status);
async function body(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString() || '{}'); }
function page(res, url, rows, total = rows.length) {
  const current = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('pageSize') || 20);
  if (!Number.isInteger(current) || current < 1 || !Number.isInteger(size) || size < 1 || size > 100) return error(res, 400, '分页超限');
  return data(res, { list: rows.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total, totalPages: Math.ceil(total / size) } });
}
function session(persona) {
  const original = inventorySession('all');
  const permissions = persona === 'denied' ? [] : ['inventory.stock.view'];
  if (['all', 'manage', 'approve', 'other'].includes(persona)) permissions.push('inventory.warehouse.view');
  if (['all', 'manage'].includes(persona)) permissions.push('inventory.transfer.manage');
  if (['all', 'approve'].includes(persona)) permissions.push('inventory.transfer.approve');
  return { ...original, token: `transfers-${persona}`, permissions: permissions.map(code => ({ code, scope: 'all' })),
    user_id: persona === 'other' ? uuid(99) : original.user_id,
    employee: { ...original.employee, id: persona === 'other' ? uuid(98) : employeeId } };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:3999'), path = url.pathname;
    if (path === '/health') return data(res, { ready: true });
    if (path === '/__test/reset') { scenario = (await body(req)).scenario || 'normal'; failed = false; journal = []; receipts = new Map(); seed(); return data(res, {}); }
    if (path === '/__test/scenario') { scenario = (await body(req)).scenario; return data(res, {}); }
    if (path === '/__test/requests') return send(res, journal);
    if (path === '/admin/auth/login') return data(res, session((await body(req)).phone));
    const persona = req.headers.authorization?.replace('Bearer transfers-', '');
    if (!persona) return error(res, 401, '请登录');
    if (path === '/admin/auth/me') return data(res, session(persona));
    if (path === '/employee/service-access') return data(res, serviceAccess);
    const entry = { path: `${path}${url.search}`, method: req.method, key: req.headers['idempotency-key'], persona };
    journal.push(entry);
    if (persona === 'denied') return error(res, 403, '缺少库存查看权限');
    if (path === '/warehouse-transfers/settings') {
      if (scenario === 'settings-error') return error(res, 503, '配置读取失败');
      if (scenario === 'settings-invalid') return data(res, {});
      return data(res, { warehouse_transfers_enabled: scenario !== 'off' });
    }
    if (path === '/warehouses') {
      if (persona === 'read') return error(res, 403, '缺少仓库查看权限');
      return page(res, url, warehouses.filter(row => (!url.searchParams.get('status') || row.status === url.searchParams.get('status'))
        && row.name.includes(url.searchParams.get('keyword') || '')));
    }
    if (path === '/inventory/balances') return page(res, url, balances
      .filter(row => `${row.sku_name}${row.sku_code}`.includes(url.searchParams.get('keyword') || ''))
      .map(row => ({ ...row, warehouse_id: url.searchParams.get('warehouseId') || warehouses[0].id })));
    if (path === '/inventory/transactions') {
      const order = orders.find(row => row.status === 'completed');
      return page(res, url, order ? ['transfer_out', 'transfer_in'].map((direction, i) => ({ ...balances[0], id: uuid(1000 + i),
        transaction_type: direction, quantity_delta: i ? '2.0001' : '-2.0001', value_delta: i ? '16.00' : '-16.00', occurred_at: now,
        created_by_employee_name: '调拨验收员工', source_document: { transfer_order_id: order.id, transfer_order_no: order.order_no,
          source_warehouse_id: order.source_warehouse_id, destination_warehouse_id: order.destination_warehouse_id } })) : []);
    }
    const match = path.match(/^\/warehouse-transfers(?:\/([^/]+))?(?:\/(items|save-draft|submit|complete|cancel))?$/);
    if (!match) return error(res, 404, `未配置的验收接口 ${path}`);
    const id = match[1]?.toLowerCase(), action = match[2];
    if (!id) {
      const keyword = url.searchParams.get('keyword') || '';
      if (keyword === '慢响应') await new Promise(resolve => setTimeout(resolve, 1200));
      return page(res, url, orders.filter(order => `${order.order_no}${order.reason}`.includes(keyword)
        && (!url.searchParams.get('status') || order.status === url.searchParams.get('status'))
        && (!url.searchParams.get('sourceWarehouseId') || order.source_warehouse_id === url.searchParams.get('sourceWarehouseId'))
        && (!url.searchParams.get('destinationWarehouseId') || order.destination_warehouse_id === url.searchParams.get('destinationWarehouseId'))));
    }
    let order = orders.find(row => row.id === id);
    if (req.method === 'GET') {
      if (!order) return error(res, 404, '调拨单不存在');
      if (action === 'items') {
        const rows = lines.get(id) || [];
        if (scenario === 'incomplete' && url.searchParams.get('pageSize') === '100') return page(res, url, rows.slice(0, 1), rows.length);
        return page(res, url, rows);
      }
      return data(res, order);
    }
    entry.body = await body(req);
    if (!entry.key) return error(res, 400, '缺少请求标识');
    if (scenario === 'retry-denied' && failed) return error(res, 403, '重试权限已撤销');
    const replayId = `${persona}:${entry.key}`;
    if (receipts.has(replayId)) return data(res, receipts.get(replayId));
    if (scenario === 'off') return error(res, 403, '仓库调拨未开启');
    const permission = action === 'complete' ? 'inventory.transfer.approve' : 'inventory.transfer.manage';
    if (!session(persona).permissions.some(row => row.code === permission)) return error(res, 403, '缺少调拨操作权限');
    if (scenario === 'conflict' && !failed && order) { failed = true; order.version++; return error(res, 409, '版本已变化，请重新确认', 'WAREHOUSE_TRANSFER_VERSION_CONFLICT'); }
    if (entry.body.expected_version !== (order?.version || 0)) return error(res, 409, '版本冲突', 'WAREHOUSE_TRANSFER_VERSION_CONFLICT');
    if (action === 'save-draft') {
      if (order && order.status !== 'draft') return error(res, 409, '终态不可编辑');
      const input = entry.body;
      if (order && (order.source_warehouse_id !== input.source_warehouse_id || order.destination_warehouse_id !== input.destination_warehouse_id)) return error(res, 409, '已保存草稿不能更换仓库', 'WAREHOUSE_TRANSFER_SOURCE_CONFLICT');
      if (!input.reason?.trim() || input.source_warehouse_id === input.destination_warehouse_id || !input.items?.length || input.items.length > 100) return error(res, 400, '草稿无效');
      if (new Set(input.items.map(line => line.supplier_sku_id.toLowerCase())).size !== input.items.length) return error(res, 400, '材料重复');
      if (input.items.some(line => !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(line.quantity) || !/[1-9]/.test(line.quantity))) return error(res, 400, '数量无效');
      order ??= { ...orders[1], id, order_no: 'DBNEW', version: 0 };
      Object.assign(order, { status: 'draft', reason: input.reason, source_warehouse_id: input.source_warehouse_id, destination_warehouse_id: input.destination_warehouse_id,
        source_warehouse_name: warehouses.find(row => row.id === input.source_warehouse_id)?.name,
        destination_warehouse_name: warehouses.find(row => row.id === input.destination_warehouse_id)?.name, item_count: input.items.length });
      if (!orders.some(row => row.id === id)) orders.unshift(order);
      lines.set(id, input.items.map(line => item(order, balances.findIndex(row => row.supplier_sku_id === line.supplier_sku_id), line.quantity)));
    } else if (action === 'submit' && order?.status === 'draft') order.status = 'submitted';
    else if (action === 'complete' && order?.status === 'submitted') {
      if (scenario === 'insufficient') return error(res, 400, '源仓库存不足', 'WAREHOUSE_TRANSFER_INSUFFICIENT_STOCK');
      order.status = 'completed'; order.completed_at = now;
      const completed = (lines.get(id) || []).map(line => {
        const [whole, fraction = ''] = line.quantity.split('.');
        const cents = ((BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'))) * 800n + 5000n) / 10000n;
        return { ...line, unit_cost: '8.0000', amount: `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}` };
      });
      lines.set(id, completed);
      const total = completed.reduce((sum, line) => sum + BigInt(line.amount.replace('.', '')), 0n);
      order.total_amount = `${total / 100n}.${String(total % 100n).padStart(2, '0')}`;
    } else if (action === 'cancel' && ['draft', 'submitted'].includes(order?.status)) order.status = 'cancelled';
    else return error(res, 409, '状态不允许操作');
    order.version++;
    const result = structuredClone({ status: action === 'save-draft' ? 'saved' : order.status, order });
    receipts.set(replayId, result);
    if (scenario === 'invalid-success' && !failed) { failed = true; return data(res, { status: 'saved', order: { ...order, id: uuid(999) } }); }
    if (['unknown', 'retry-denied', 'rate-limit'].includes(scenario) && !failed) { failed = true; return error(res, scenario === 'rate-limit' ? 429 : 503, '请求结果未知'); }
    return data(res, result);
  } catch (caught) { error(res, 500, caught instanceof Error ? caught.message : '验收错误'); }
});
server.listen(3999, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));

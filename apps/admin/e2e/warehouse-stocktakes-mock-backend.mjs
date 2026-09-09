// Local browser HTTP boundary; state transitions model the published API, not DB correctness.
import { createServer } from 'node:http';
import { serviceAccess } from './inventory-mock-fixture.mjs';
import { balances, warehouses, now, uuid, session, seed, item, decimalUnits, decimalString } from './warehouse-stocktakes-mock-fixture.mjs';
let state = seed(), scenario = 'normal', failed = false, journal = [], receipts = new Map();
const send = (res, value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
const data = (res, value) => send(res, { success: true, data: value });
const error = (res, status, message, code = 'WAREHOUSE_STOCKTAKE_INVALID') => send(res, { success: false, message, code }, status);
async function rawBody(req) { const chunks = []; for await (const chunk of req) chunks.push(chunk); return Buffer.concat(chunks).toString(); }
async function body(req) { return JSON.parse(await rawBody(req) || '{}'); }
function page(res, url, rows, total = rows.length) {
  const current = Number(url.searchParams.get('page') || 1), size = Number(url.searchParams.get('pageSize') || 20);
  if (!Number.isInteger(current) || current < 1 || !Number.isInteger(size) || size < 1 || size > 100) return error(res, 400, '分页超限');
  return data(res, { list: rows.slice((current - 1) * size, current * size), pagination: { page: current, pageSize: size, total, totalPages: Math.ceil(total / size) } });
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:4001'), path = url.pathname;
    if (path === '/health') return data(res, { ready: true });
    if (path === '/__test/reset') { scenario = (await body(req)).scenario || 'normal'; failed = false; journal = []; receipts = new Map(); state = seed(); return data(res, {}); }
    if (path === '/__test/scenario') { scenario = (await body(req)).scenario; return data(res, {}); }
    if (path === '/__test/requests') return send(res, journal);
    if (path === '/admin/auth/login') return data(res, session((await body(req)).phone));
    const persona = req.headers.authorization?.replace('Bearer stocktakes-', '');
    if (!persona) return error(res, 401, '请登录');
    if (path === '/admin/auth/me') return data(res, session(persona));
    if (path === '/employee/service-access') return data(res, serviceAccess);
    const entry = { path: `${path}${url.search}`, method: req.method, key: req.headers['idempotency-key'], persona };
    journal.push(entry);
    if (persona === 'denied') return error(res, 403, '缺少库存查看权限');
    if (path === '/warehouse-stocktakes/settings') {
      if (scenario === 'settings-error') return error(res, 503, '配置读取失败');
      if (scenario === 'settings-invalid') return data(res, { warehouse_stocktakes_enabled: 'true' });
      return data(res, { warehouse_stocktakes_enabled: scenario !== 'off' });
    }
    if (path === '/warehouses') return page(res, url, warehouses.filter(row => (!url.searchParams.get('status') || row.status === url.searchParams.get('status')) && row.name.includes(url.searchParams.get('keyword') || '')));
    if (path === '/inventory/balances') return page(res, url, balances.filter(row => `${row.sku_name}${row.sku_code}`.includes(url.searchParams.get('keyword') || '')).map(row => ({ ...row, warehouse_id: url.searchParams.get('warehouseId') || warehouses[0].id, quantity_on_hand: row.supplier_sku_id === balances[2].supplier_sku_id ? '0.0000' : row.quantity_on_hand })));
    if (path === '/inventory/transactions') {
      const order = state.orders.find(row => row.status === 'completed');
      return page(res, url, order ? ['adjustment_in', 'adjustment_out'].map((direction, i) => ({ ...balances[i], id: uuid(1000 + i), transaction_type: direction,
        quantity_delta: i ? '-10.0000' : '1.0001', value_delta: i ? '-80.00' : '8.00', unit_cost: '8.0000', occurred_at: now,
        source_type: 'warehouse_stocktake_item', source_id: uuid(1100 + i), project_id: null, cost_category_id: null,
        created_by_employee_id: session(persona).employee.id, created_by_employee_name: '盘点验收员工', created_at: now,
        source_document: { stocktake_order_id: order.id, stocktake_order_no: order.order_no } })) : []);
    }
    const match = path.match(/^\/warehouse-stocktakes(?:\/([^/]+))?(?:\/(items|save-draft|start|record-counts|submit|complete|cancel))?$/);
    if (!match) return error(res, 404, `未配置的验收接口 ${path}`);
    const id = match[1]?.toLowerCase(), action = match[2];
    if (!id) {
      const keyword = url.searchParams.get('keyword') || '';
      if (keyword === '慢响应') await new Promise(resolve => setTimeout(resolve, 1200));
      return page(res, url, state.orders.filter(order => `${order.order_no}${order.reason}`.includes(keyword) && (!url.searchParams.get('status') || order.status === url.searchParams.get('status')) && (!url.searchParams.get('warehouseId') || order.warehouse_id === url.searchParams.get('warehouseId'))));
    }
    let order = state.orders.find(row => row.id === id);
    if (req.method === 'GET') {
      if (!order) return error(res, 404, '盘点单不存在');
      if (action === 'items') {
        const rows = state.lines.get(id) || [];
        if (scenario === 'incomplete' && url.searchParams.get('pageSize') === '100') return page(res, url, rows.slice(0, 1), rows.length);
        return page(res, url, rows);
      }
      return data(res, order);
    }
    entry.rawBody = await rawBody(req); entry.body = JSON.parse(entry.rawBody);
    if (!entry.key) return error(res, 400, '缺少请求标识');
    if (scenario === 'retry-denied' && failed) return error(res, 403, '重试权限已撤销');
    const replayId = `${persona}:${entry.key}`;
    if (receipts.has(replayId)) return data(res, receipts.get(replayId));
    if (scenario === 'off') return error(res, 403, '盘点未开启');
    const permission = action === 'complete' ? 'inventory.stocktake.approve' : 'inventory.stocktake.manage';
    if (!session(persona).permissions.some(row => row.code === permission)) return error(res, 403, '缺少盘点操作权限');
    if (scenario === 'conflict' && !failed && order) { failed = true; order.version++; return error(res, 409, '版本已变化，请重新确认', 'WAREHOUSE_STOCKTAKE_VERSION_CONFLICT'); }
    if (entry.body.expected_version !== (order?.version || 0)) return error(res, 409, '版本冲突', 'WAREHOUSE_STOCKTAKE_VERSION_CONFLICT');
    const input = entry.body;
    if (action === 'save-draft') {
      if (order && order.status !== 'draft') return error(res, 409, '终态不可编辑');
      if (order && order.warehouse_id !== input.warehouse_id) return error(res, 409, '已保存仓库不可变更');
      if (!input.reason?.trim() || !input.items?.length || input.items.length > 100) return error(res, 400, '草稿无效');
      order ??= { ...state.orders[1], id, order_no: 'PDNEW', version: 0 };
      Object.assign(order, { status: 'draft', warehouse_id: input.warehouse_id, warehouse_name: warehouses.find(row => row.id === input.warehouse_id)?.name, reason: input.reason, item_count: input.items.length });
      if (!state.orders.some(row => row.id === id)) state.orders.unshift(order);
      state.lines.set(id, input.items.map(line => item(order, balances.findIndex(row => row.supplier_sku_id === line.supplier_sku_id))));
    } else if (action === 'start' && order?.status === 'draft') {
      order.status = 'counting'; order.started_at = now;
      state.lines.set(id, state.lines.get(id).map(line => ({ ...line, snapshot_at: now, book_balance_id: balances.find(sku => sku.supplier_sku_id === line.supplier_sku_id).id, book_balance_version: 1, book_quantity: '10.0000', book_value: '80.00', book_unit_cost: '8.0000' })));
    } else if (action === 'record-counts' && order?.status === 'counting') {
      for (const count of input.items) {
        const line = state.lines.get(id).find(row => row.supplier_sku_id === count.supplier_sku_id);
        if (!line || !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(count.counted_quantity)) return error(res, 400, '实盘数量无效');
        const difference = decimalUnits(count.counted_quantity) - decimalUnits(line.book_quantity);
        if (difference && !count.difference_reason?.trim()) return error(res, 400, '差异原因必填');
        Object.assign(line, { counted_quantity: count.counted_quantity, difference_quantity: decimalString(difference), difference_reason: count.difference_reason ?? null });
      }
      order.counted_count = state.lines.get(id).filter(row => row.counted_quantity !== null).length;
      order.difference_count = state.lines.get(id).filter(row => row.difference_quantity !== null && decimalUnits(row.difference_quantity.replace('-', '')) !== 0n).length;
    } else if (action === 'submit' && order?.status === 'counting' && order.counted_count === order.item_count) { order.status = 'submitted'; order.submitted_at = now; }
    else if (action === 'complete' && order?.status === 'submitted') {
      if (scenario === 'snapshot-conflict') return error(res, 409, '快照冲突', 'WAREHOUSE_STOCKTAKE_SNAPSHOT_CONFLICT');
      if (scenario === 'cost-basis') return error(res, 409, '成本依据缺失', 'WAREHOUSE_STOCKTAKE_COST_BASIS_REQUIRED');
      order.status = 'completed'; order.completed_at = now;
      let gain = 0n, loss = 0n;
      state.lines.set(id, state.lines.get(id).map(line => {
        const difference = decimalUnits(line.counted_quantity) - decimalUnits(line.book_quantity);
        const amount = ((difference < 0n ? -difference : difference) * 800n + 5000n) / 10000n;
        if (difference < 0n) loss += amount; else gain += amount;
        return { ...line, unit_cost: '8.0000', amount: decimalString(amount, 100n, 2) };
      }));
      order.gain_amount = decimalString(gain, 100n, 2); order.loss_amount = decimalString(loss, 100n, 2);
    } else if (action === 'cancel' && ['draft', 'counting', 'submitted'].includes(order?.status)) { order.status = 'cancelled'; order.cancelled_at = now; }
    else return error(res, 409, '状态不允许操作');
    order.version++;
    const { warehouse_name, item_count, counted_count, difference_count, gain_amount, loss_amount, ...baseOrder } = order;
    const result = structuredClone({ status: action === 'save-draft' ? 'saved' : order.status, order: baseOrder });
    receipts.set(replayId, result);
    if (scenario === 'slow-success' && !failed) { failed = true; await new Promise(resolve => setTimeout(resolve, 2500)); }
    if (scenario === 'invalid-success' && !failed) { failed = true; return data(res, { ...result, order: { ...order, id: uuid(999) } }); }
    if (['unknown', 'retry-denied', 'rate-limit', 'network'].includes(scenario) && !failed) {
      failed = true;
      if (scenario === 'network') return res.destroy();
      return error(res, scenario === 'rate-limit' ? 429 : 503, '请求结果未知');
    }
    return data(res, result);
  } catch (caught) { error(res, 500, caught instanceof Error ? caught.message : '验收错误'); }
});
server.listen(4001, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));

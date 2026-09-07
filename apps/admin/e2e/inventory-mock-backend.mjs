import { createServer } from 'node:http';
import {
  balances,
  transactions,
  warehouses,
  session,
  serviceAccess,
} from './inventory-mock-fixture.mjs';

let journal = [];
let scenario = 'normal';
let failures = 0;
const send = (response, data, status = 200) => {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(data));
};
const data = (response, payload) =>
  send(response, { success: true, data: payload });
const error = (response, status, message) =>
  send(
    response,
    {
      success: false,
      code: status === 403 ? 'FORBIDDEN' : 'INVENTORY_TEST_ERROR',
      message,
    },
    status,
  );
async function body(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function page(response, url, records) {
  const page = Number(url.searchParams.get('page') ?? 1);
  const pageSize = Number(url.searchParams.get('pageSize') ?? 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 100
  )
    return error(response, 400, '无效分页参数');
  data(response, {
    list: records.slice((page - 1) * pageSize, page * pageSize),
    pagination: {
      page,
      pageSize,
      total: records.length,
      totalPages: Math.ceil(records.length / pageSize),
    },
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1:4007');
    if (url.pathname === '/health') return data(response, { ready: true });
    if (url.pathname === '/__test/reset' && request.method === 'POST') {
      scenario = (await body(request)).scenario ?? 'normal';
      journal = [];
      failures = 0;
      return data(response, { reset: true });
    }
    if (url.pathname === '/__test/requests') return send(response, journal);
    if (url.pathname === '/admin/auth/login' && request.method === 'POST') {
      const persona = (await body(request)).phone;
      if (!['all', 'stock', 'stock-order', 'denied'].includes(persona))
        return error(response, 401, '测试身份不存在');
      return data(response, session(persona));
    }
    const token = request.headers.authorization?.replace('Bearer ', '');
    const persona = ['all', 'stock', 'stock-order', 'denied'].find(
      (value) => token === `inventory-${value}-token`,
    );
    if (!persona) return error(response, 401, '请登录');
    if (url.pathname === '/admin/auth/me')
      return data(response, session(persona));
    if (url.pathname === '/employee/service-access')
      return data(response, serviceAccess);
    const entry = { path: `${url.pathname}${url.search}`, completed: false };
    journal.push(entry);
    response.on('finish', () => {
      entry.completed = true;
    });
    if (request.method !== 'GET')
      return error(response, 405, '库存验收后端仅支持只读业务');
    if (url.pathname === '/warehouses') {
      if (persona !== 'all') return error(response, 403, '无仓库目录权限');
      const keyword = url.searchParams.get('keyword')?.trim() ?? '';
      return page(
        response,
        url,
        warehouses.filter((row) => row.name.includes(keyword)),
      );
    }
    if (
      url.pathname === '/inventory/balances' ||
      url.pathname === '/inventory/transactions'
    ) {
      if (persona === 'denied') return error(response, 403, '无库存查看权限');
      if (scenario === 'error-once' && failures++ === 0)
        return error(response, 503, '库存验收暂时不可用');
      const keyword = url.searchParams.get('keyword')?.trim() ?? '';
      if (keyword.startsWith('慢响应')) {
        await new Promise((resolve) => setTimeout(resolve, 1800));
        return page(response, url, [
          { ...balances[0], sku_name: '慢响应商品' },
        ]);
      }
      const source = url.pathname.endsWith('/balances')
        ? balances
        : transactions;
      const records = source.filter((row) => {
        const warehouse = url.searchParams.get('warehouseId');
        const sku = url.searchParams.get('supplierSkuId');
        const type = url.searchParams.get('transactionType');
        return (
          (!warehouse || warehouse === row.warehouse_id) &&
          (!sku || sku === row.supplier_sku_id) &&
          (!type || type === row.transaction_type) &&
          (!keyword ||
            row.sku_name.includes(keyword) ||
            row.sku_code.includes(keyword))
        );
      });
      return page(response, url, records);
    }
    return error(response, 404, `未配置的验收接口: ${url.pathname}`);
  } catch (caught) {
    error(
      response,
      500,
      caught instanceof Error ? caught.message : '验收后端错误',
    );
  }
});
server.listen(4007, '127.0.0.1');
process.on('SIGTERM', () => server.close(() => process.exit(0)));

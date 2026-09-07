import { afterEach, expect, test } from 'bun:test';
import { loadInventory, loadInventoryWarehouses } from './inventory-api';
import { initialInventoryState } from './inventory-rules';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('denied inventory and stock-only warehouse options never call the backend', async () => {
  let calls = 0;
  globalThis.fetch = Object.assign(
    () => {
      calls++;
      return Promise.reject(new Error('unexpected fetch'));
    },
    { preconnect: originalFetch.preconnect },
  );
  expect(await loadInventory(false, initialInventoryState)).toBeNull();
  expect(
    await loadInventoryWarehouses(false, { page: 1, keyword: '' }),
  ).toBeNull();
  expect(calls).toBe(0);
});

test('warehouse options are server searched and paginated, including inactive warehouses', async () => {
  let requested = '';
  globalThis.fetch = (async (input) => {
    requested = String(input);
    return Response.json({
      data: {
        list: [],
        pagination: { page: 6, pageSize: 20, total: 120, totalPages: 6 },
      },
    });
  }) as typeof fetch;
  const result = await loadInventoryWarehouses(true, {
    page: 6,
    keyword: ' 中心 ',
  });
  expect(requested).toBe(
    '/api/backend/warehouses?page=6&pageSize=20&keyword=%E4%B8%AD%E5%BF%83',
  );
  expect(result?.pagination.totalPages).toBe(6);
});

test('inventory reads go through the proxy and forward cancellation', async () => {
  let requested = '';
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (async (input, init) => {
    requested = String(input);
    signal = init?.signal;
    return Response.json({
      data: {
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
  }) as typeof fetch;
  const controller = new AbortController();
  const result = await loadInventory(
    true,
    { ...initialInventoryState, tab: 'transactions' },
    controller.signal,
  );
  expect(result?.tab).toBe('transactions');
  expect(requested).toBe(
    '/api/backend/inventory/transactions?page=1&pageSize=20',
  );
  expect(signal).toBe(controller.signal);
});

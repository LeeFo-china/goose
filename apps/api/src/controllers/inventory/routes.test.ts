import { beforeEach, describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '30000000-0000-4000-8000-000000000001';
const WAREHOUSE_ID = '40000000-0000-4000-8000-000000000001';

const authContext = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: 'active',
  isPlatformAdmin: false,
  employeeName: '管理员',
  employeeStatus: 'active',
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: 'inventory.stock.view', scope: 'all' }],
};

const listBalances = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const listTransactions = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));

mock.module('@/services/inventory', () => ({
  inventoryService: { listBalances, listTransactions },
}));

function request(input: { query?: unknown }) {
  return {
    query: input.query,
    raw: { rawHeaders: [] },
  };
}

async function controller() {
  const { default: value } = await import('.');
  (value as unknown as {
    getRequiredTenantContext: () => Promise<typeof authContext>;
  }).getRequiredTenantContext = mock(async () => authContext);
  return value;
}

describe('InventoryController routes', () => {
  beforeEach(() => {
    listBalances.mockClear();
    listTransactions.mockClear();
  });

  test('registers inventory routes and index route binding', async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    const app = {
      get: (path: string) => routes.push({ method: 'GET', path }),
    };

    value.registerExtraRoutes(app as never);
    const routesIndex = await Bun.file(new URL(
      '../../routes/index.ts',
      import.meta.url,
    )).text();

    expect(routes).toEqual([
      { method: 'GET', path: '/inventory/balances' },
      { method: 'GET', path: '/inventory/transactions' },
    ]);
    expect(routesIndex).toContain(
      'import InventoryController from "@/controllers/inventory";',
    );
    expect(routesIndex).toContain('InventoryController.registerExtraRoutes(app);');
  });

  test('parses inventory list queries', async () => {
    const value = await controller();

    await value.listBalances(request({
      query: { page: '2', pageSize: '20', warehouseId: WAREHOUSE_ID },
    }) as never);
    await value.listTransactions(request({
      query: { transactionType: 'purchase_receipt' },
    }) as never);

    expect(listBalances).toHaveBeenCalledWith(authContext, {
      page: 2,
      pageSize: 20,
      warehouseId: WAREHOUSE_ID,
    });
    expect(listTransactions).toHaveBeenCalledWith(authContext, {
      page: 1,
      pageSize: 20,
      transactionType: 'purchase_receipt',
    });
  });
});

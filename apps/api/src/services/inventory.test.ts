import { describe, expect, mock, test } from 'bun:test';

import { AppError } from '@/errors/app-error';
import type { AuthContext } from '@/services/authorization';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const USER_ID = '20000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '30000000-0000-4000-8000-000000000001';
const WAREHOUSE_ID = '40000000-0000-4000-8000-000000000001';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

function auth(permissions: string[]): AuthContext {
  return {
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
    permissions: permissions.map((code) => ({ code, scope: 'all' as const })),
  };
}

describe('InventoryService', () => {
  test('requires stock read permission for inventory balances', async () => {
    const repository = {
      listBalances: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
      listTransactions: mock(async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
    };
    const access = {
      assertTenantContext: mock(() => TENANT_ID),
      assertPermission: mock((inputAuth: AuthContext, code: string) => {
        if (!inputAuth.permissions.some((item) => item.code === code)) {
          throw new AppError(403, 'Forbidden', 'FORBIDDEN');
        }
        return 'all' as const;
      }),
    };
    const { InventoryService } = await import('./inventory');
    const service = new InventoryService({ repository, access });

    await service.listBalances(auth(['inventory.stock.view']), {
      page: 1,
      pageSize: 20,
      warehouseId: WAREHOUSE_ID,
    });

    expect(repository.listBalances).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      warehouse_id: WAREHOUSE_ID,
      page: 1,
      pageSize: 20,
    });
    expect(() => service.listTransactions(auth([]), {
      page: 1,
      pageSize: 20,
    })).toThrow(AppError);
    expect(repository.listTransactions).not.toHaveBeenCalled();
  });
});

import { beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';

import type { AuthContext } from '@/services/authorization';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const PAGE_EMPLOYEE_ID = '22222222-2222-4222-8222-222222222222';
const INCLUDED_EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333';
const MANAGE_PERMISSION = 'platform.service_trial.manage';
const OPERATOR_READ_PERMISSION = 'platform.operator.read';

let PlatformServiceTrialService:
  typeof import('./platform-service-trials').PlatformServiceTrialService;

beforeAll(async () => {
  ({ PlatformServiceTrialService } = await import('./platform-service-trials'));
});

function platformAuth(permissionCodes: readonly string[]): AuthContext {
  return {
    authUserId: 'auth-platform', employeeId: ACTOR_ID, tenantId: null,
    tenantName: null, tenantSlug: null, tenantStatus: null,
    isPlatformAdmin: false, isPlatformStaff: true,
    isPlatformSuperAdmin: false, adminAuthVersion: 1,
    employeeName: '平台运营', employeeStatus: 'active', departmentId: null,
    tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null, roleCodes: ['platform_staff'],
    roles: [],
    permissions: permissionCodes.map((code) => ({ code, scope: 'all' })),
  };
}

function candidatePage() {
  return {
    list: [{
      id: PAGE_EMPLOYEE_ID,
      name: '王运营',
      phone: '13800138000',
      status: 'active' as const,
      roles: [
        { code: 'platform_support', name: '平台支持' },
        { code: 'platform_admin', name: '平台管理员' },
      ],
    }],
    includedEmployee: {
      id: INCLUDED_EMPLOYEE_ID,
      name: '李顾问',
      phone: '13900139000',
      status: 'active' as const,
      roles: [{ code: 'platform_service', name: null }],
    },
    pagination: { page: 2, pageSize: 20, total: 41, totalPages: 3 },
  };
}

describe('PlatformServiceTrialService assignee candidates', () => {
  let assigneeRepository: { listCandidates: ReturnType<typeof mock> };

  beforeEach(() => {
    assigneeRepository = {
      listCandidates: mock(async () => candidatePage()),
    };
  });

  test('requires trial manage permission without requiring operator read', async () => {
    const service = new PlatformServiceTrialService({ assigneeRepository });
    const query = {
      page: 2, pageSize: 20, keyword: '运营',
      includeEmployeeId: INCLUDED_EMPLOYEE_ID,
    };

    await expect(service.listAssigneeCandidates(platformAuth([]), query))
      .rejects.toMatchObject({
        statusCode: 403,
        code: 'PLATFORM_PERMISSION_REQUIRED',
        details: { permission: MANAGE_PERMISSION },
      });
    await expect(service.listAssigneeCandidates(
      platformAuth([OPERATOR_READ_PERMISSION]),
      query,
    )).rejects.toMatchObject({
      statusCode: 403,
      details: { permission: MANAGE_PERMISSION },
    });
    expect(assigneeRepository.listCandidates).not.toHaveBeenCalled();

    await service.listAssigneeCandidates(platformAuth([MANAGE_PERMISSION]), query);
    expect(assigneeRepository.listCandidates).toHaveBeenCalledTimes(1);
  });

  test('returns one safe selectable view per eligible active candidate', async () => {
    const service = new PlatformServiceTrialService({ assigneeRepository });
    const query = {
      page: 2,
      pageSize: 20,
      keyword: '运营',
      includeEmployeeId: INCLUDED_EMPLOYEE_ID,
    };

    const result = await service.listAssigneeCandidates(
      platformAuth([MANAGE_PERMISSION]),
      query,
    );

    expect(assigneeRepository.listCandidates).toHaveBeenCalledTimes(1);
    expect(assigneeRepository.listCandidates).toHaveBeenCalledWith(query);
    expect(result.pagination).toEqual(candidatePage().pagination);
    expect(result.list).toEqual([
      {
        id: PAGE_EMPLOYEE_ID,
        name: '王运营',
        phone_masked: '138****8000',
        status: 'active',
        roles: [
          { code: 'platform_admin', name: '平台管理员' },
          { code: 'platform_support', name: '平台支持' },
        ],
        selectable: true,
        historical: false,
      },
      {
        id: INCLUDED_EMPLOYEE_ID,
        name: '李顾问',
        phone_masked: '139****9000',
        status: 'active',
        roles: [{ code: 'platform_service', name: null }],
        selectable: true,
        historical: false,
      },
    ]);
    expect(result.list.filter(({ id }) => id === INCLUDED_EMPLOYEE_ID))
      .toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain('13800138000');
    expect(JSON.stringify(result)).not.toContain('13900139000');
  });

  test('rejects an included employee outside the exact include request', async () => {
    const service = new PlatformServiceTrialService({ assigneeRepository });

    await expect(service.listAssigneeCandidates(
      platformAuth([MANAGE_PERMISSION]),
      { page: 2, pageSize: 20 },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: 'DB_ERROR',
      message: '平台跟进人候选数据格式错误',
    });
  });

  test.each([
    ['invalid phone', () => ({
      ...candidatePage(),
      list: [{ ...candidatePage().list[0], phone: 'not-a-phone' }],
    })],
    ['inactive employee', () => ({
      ...candidatePage(),
      list: [{ ...candidatePage().list[0], status: 'suspended' }],
    })],
    ['missing platform role', () => ({
      ...candidatePage(),
      list: [{ ...candidatePage().list[0], roles: [] }],
    })],
    ['inconsistent pagination', () => ({
      ...candidatePage(),
      pagination: { page: 2, pageSize: 20, total: 41, totalPages: 2 },
    })],
  ])('fails closed for malformed repository data: %s', async (_, makePage) => {
    assigneeRepository.listCandidates.mockImplementationOnce(async () =>
      makePage() as ReturnType<typeof candidatePage>
    );
    const service = new PlatformServiceTrialService({ assigneeRepository });

    await expect(service.listAssigneeCandidates(
      platformAuth([MANAGE_PERMISSION]),
      { page: 2, pageSize: 20, includeEmployeeId: INCLUDED_EMPLOYEE_ID },
    )).rejects.toMatchObject({
      statusCode: 500,
      code: 'DB_ERROR',
      message: '平台跟进人候选数据格式错误',
    });
  });
});

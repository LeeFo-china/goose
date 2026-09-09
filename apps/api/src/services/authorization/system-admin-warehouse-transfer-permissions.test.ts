import { describe, expect, test } from 'bun:test';
import type { EmployeePermissionContextRecord } from '@/repositories/permissions';
import {
  TRANSFER_DRAFT,
  TRANSFER_ID,
  TRANSFER_ORDER,
} from '@/repositories/warehouse-transfer-test-fixtures';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const AUTH_USER_ID = '30000000-0000-4000-8000-000000000001';
const EMPLOYEE_ID = '40000000-0000-4000-8000-000000000001';
const TENANT_ID = '50000000-0000-4000-8000-000000000001';
const ROLE_ID = '60000000-0000-4000-8000-000000000001';
const TRANSFER_PERMISSIONS = ['inventory.transfer.manage', 'inventory.transfer.approve'] as const;
const COMMAND_CASES = [
  { command: 'save_draft', permission: TRANSFER_PERMISSIONS[0], input: TRANSFER_DRAFT },
  { command: 'complete', permission: TRANSFER_PERMISSIONS[1], input: { expected_version: 2 } },
] as const;

interface ContextOptions {
  roleCode?: string;
  roleStatus?: string;
  employeeStatus?: string;
  missingEmployee?: boolean;
  missingTenant?: boolean;
}

function permissionContext(options: ContextOptions = {}): EmployeePermissionContextRecord {
  return {
    employee: options.missingEmployee ? null : {
      id: EMPLOYEE_ID,
      user_id: AUTH_USER_ID,
      tenant_id: options.missingTenant ? null : TENANT_ID,
      status: options.employeeStatus ?? 'active',
      tenant_department_id: null,
      post_id: null,
      name: '租户管理员',
      phone: null,
      avatar: null,
      tenant_department: null,
      post: null,
      tenant: options.missingTenant ? null : {
        id: TENANT_ID, name: '测试租户', slug: 'test-tenant', status: 'active',
      },
    },
    roles: [{
      id: ROLE_ID,
      tenant_id: options.missingTenant ? null : TENANT_ID,
      code: options.roleCode ?? 'system_admin',
      name: '测试角色',
      description: null,
      status: options.roleStatus ?? 'active',
      created_at: '2026-09-09T00:00:00Z',
      updated_at: '2026-09-09T00:00:00Z',
    }],
    rolePermissions: [],
    overrides: [],
  };
}

async function setup(input: EmployeePermissionContextRecord) {
  const { buildAuthContext } = await import('./legacy/context-builder');
  const { WarehouseTransfersService } = await import('../warehouse-transfers');
  const { WarehouseTransfersRepository } = await import('@/repositories/warehouse-transfers');
  const calls: { name: string; params: Record<string, unknown> }[] = [];
  const repository = new WarehouseTransfersRepository({
    rpc: async (name, params) => {
      calls.push({ name, params });
      const completed = params.p_command === 'complete';
      return {
        data: {
          status: completed ? 'completed' : 'saved',
          order: {
            ...TRANSFER_ORDER,
            tenant_id: TENANT_ID,
            created_by_employee_id: EMPLOYEE_ID,
            updated_by_employee_id: EMPLOYEE_ID,
            status: completed ? 'completed' : 'draft',
            version: completed ? 3 : 1,
            submitted_at: completed ? '2026-09-09T00:00:00Z' : null,
            completed_at: completed ? '2026-09-09T00:00:00Z' : null,
          },
        },
        error: null,
      };
    },
  });
  return {
    auth: buildAuthContext(input, AUTH_USER_ID),
    service: new WarehouseTransfersService({ repository }),
    calls,
  };
}

describe('system administrator warehouse transfer permissions', () => {
  for (const { command, permission, input } of COMMAND_CASES) {
    test(`active tenant system_admin can ${command} through its derived permissions`, async () => {
      const { auth, service, calls } = await setup(permissionContext());
      const result = await service.command(auth, TRANSFER_ID, command, input, ' transfer-key ');

      expect(result.status).toBe(command === 'complete' ? 'completed' : 'saved');
      expect(auth.permissions).toContainEqual({ code: permission, scope: 'all' });
      expect(calls).toEqual([{
        name: 'command_warehouse_transfer_order',
        params: {
          p_tenant_id: TENANT_ID,
          p_actor_user_id: AUTH_USER_ID,
          p_actor_employee_id: EMPLOYEE_ID,
          p_order_id: TRANSFER_ID,
          p_command: command,
          p_expected_version: input.expected_version,
          p_idempotency_key: 'transfer-key',
          p_payload: command === 'complete' ? {} : {
            source_warehouse_id: TRANSFER_DRAFT.source_warehouse_id,
            destination_warehouse_id: TRANSFER_DRAFT.destination_warehouse_id,
            reason: TRANSFER_DRAFT.reason,
            items: TRANSFER_DRAFT.items,
          },
        },
      }]);
    });
  }

  const deniedContexts: [string, ContextOptions][] = [
    ['ordinary role without grants', { roleCode: 'warehouse_staff' }],
    ['inactive system_admin role', { roleStatus: 'inactive' }],
    ['inactive employee', { employeeStatus: 'inactive' }],
    ['missing employee', { missingEmployee: true }],
    ['missing tenant', { missingTenant: true }],
  ];

  test.each(deniedContexts)('%s cannot inherit transfer permissions or execute commands', async (_label, options) => {
    const { auth, service, calls } = await setup(permissionContext(options));
    for (const { command, permission, input } of COMMAND_CASES) {
      expect(auth.permissions.some((item) => item.code === permission)).toBe(false);
      await expect(service.command(auth, TRANSFER_ID, command, input, 'key'))
        .rejects.toMatchObject({ statusCode: 403 });
    }
    expect(calls).toHaveLength(0);
  });

  for (const granted of COMMAND_CASES) {
    test(`ordinary role granted ${granted.permission} cannot use the other transfer permission`, async () => {
      const context = permissionContext({ roleCode: 'warehouse_staff' });
      context.rolePermissions = [{ code: granted.permission, scope: 'self' }];
      const { auth, service, calls } = await setup(context);
      expect(auth.permissions).toEqual([{ code: granted.permission, scope: 'self' }]);

      for (const candidate of COMMAND_CASES) {
        if (candidate.command !== granted.command) {
          await expect(service.command(auth, TRANSFER_ID, candidate.command, candidate.input, 'denied'))
            .rejects.toMatchObject({ statusCode: 403 });
        }
      }
      expect(calls).toHaveLength(0);
      const result = await service.command(auth, TRANSFER_ID, granted.command, granted.input, 'allowed');
      expect(result.status).toBe(granted.command === 'complete' ? 'completed' : 'saved');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.params.p_command).toBe(granted.command);
    });
  }
});

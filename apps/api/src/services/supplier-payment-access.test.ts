import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "82000000-0000-4000-8000-000000000001";
const PROJECT_ID = "82000000-0000-4000-8000-000000000002";
const USER_ID = "82000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "82000000-0000-4000-8000-000000000004";

function auth(
  permissions: string[],
  overrides: Partial<AuthContext> = {},
): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "test",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "财务",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: permissions.map((code) => ({ code, scope: "all" })),
    ...overrides,
  };
}

function dependencies(overrides: {
  moduleEnabled?: boolean;
  projectAccess?: boolean;
} = {}) {
  return {
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) {
          throw Object.assign(new Error(), {
            code: "TENANT_CONTEXT_REQUIRED",
          });
        }
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some(({ code }) => code === permission)) {
          throw Object.assign(new Error(), { code: "FORBIDDEN" });
        }
      }),
      canAccessProject: mock(async () => overrides.projectAccess ?? true),
    },
    repository: {
      getSettings: mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: overrides.moduleEnabled ?? true,
      })),
    },
  };
}

describe("SupplierPaymentAccessService", () => {
  test("isolates all five supplier payment permissions", async () => {
    const deps = dependencies();
    const { SupplierPaymentAccessService } = await import(
      "./supplier-payment-access"
    );
    const service = new SupplierPaymentAccessService(deps as never);
    const cases = [
      ["requirePayableRead", "supplier.payable.view"],
      ["requireRequestRead", "supplier.payment-request.view"],
      ["requireRequestManage", "supplier.payment-request.manage"],
      ["requireRequestApprove", "supplier.payment-request.approve"],
      ["requirePayment", "supplier.payment-request.pay"],
    ] as const;

    for (const [method, permission] of cases) {
      const context = auth([permission]);
      expect(await service[method](context)).toEqual({
        tenantId: TENANT_ID,
        authUserId: USER_ID,
        employeeId: EMPLOYEE_ID,
      });
      expect(deps.accessPolicy.assertPermission).toHaveBeenLastCalledWith(
        context,
        permission,
      );
    }
  });

  test("checks tenant scope and module state before granting access", async () => {
    const { SupplierPaymentAccessService } = await import(
      "./supplier-payment-access"
    );
    await expect(
      new SupplierPaymentAccessService(dependencies() as never)
        .requirePayableRead(auth(["supplier.payable.view"], {
          tenantId: null,
          isPlatformAdmin: true,
        })),
    ).rejects.toMatchObject({ code: "TENANT_CONTEXT_REQUIRED" });
    await expect(
      new SupplierPaymentAccessService(
        dependencies({ moduleEnabled: false }) as never,
      ).requireRequestRead(auth(["supplier.payment-request.view"])),
    ).rejects.toMatchObject({ code: "SUPPLIER_MODULE_DISABLED" });
  });

  test("rejects missing actor identity and cross-permission use", async () => {
    const { SupplierPaymentAccessService } = await import(
      "./supplier-payment-access"
    );
    const service = new SupplierPaymentAccessService(dependencies() as never);
    await expect(service.requirePayment(
      auth(["supplier.payment-request.pay"], { employeeId: null }),
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.requireRequestApprove(
      auth(["supplier.payment-request.manage"]),
    )).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("delegates project read and update boundaries independently", async () => {
    const deps = dependencies();
    const { SupplierPaymentAccessService } = await import(
      "./supplier-payment-access"
    );
    const service = new SupplierPaymentAccessService(deps as never);
    const context = auth(["project.read", "project.update"]);

    await service.assertProjectRead(context, PROJECT_ID);
    await service.assertProjectUpdate(context, PROJECT_ID);
    expect(deps.accessPolicy.canAccessProject).toHaveBeenNthCalledWith(
      1,
      context,
      PROJECT_ID,
      "project.read",
    );
    expect(deps.accessPolicy.canAccessProject).toHaveBeenNthCalledWith(
      2,
      context,
      PROJECT_ID,
      "project.update",
    );

    const denied = new SupplierPaymentAccessService(
      dependencies({ projectAccess: false }) as never,
    );
    await expect(denied.assertProjectRead(context, PROJECT_ID))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

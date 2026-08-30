import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "67000000-0000-4000-8000-000000000001";
const PROJECT_ID = "67000000-0000-4000-8000-000000000002";
const USER_ID = "67000000-0000-4000-8000-000000000003";
const EMPLOYEE_ID = "67000000-0000-4000-8000-000000000004";
const CREATOR_ID = "67000000-0000-4000-8000-000000000005";

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
    employeeName: "采购员",
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
  readProjectIds?: string[] | null;
  updateProjectIds?: string[] | null;
} = {}) {
  return {
    accessPolicy: {
      assertTenantContext: mock((context: AuthContext) => {
        if (!context.tenantId) {
          throw Object.assign(new Error(), { code: "TENANT_CONTEXT_REQUIRED" });
        }
        return context.tenantId;
      }),
      assertPermission: mock((context: AuthContext, permission: string) => {
        if (!context.permissions.some(({ code }) => code === permission)) {
          throw Object.assign(new Error(), { code: "FORBIDDEN" });
        }
        return "all" as const;
      }),
      getVisibleProjectIds: mock(
        async (_context: AuthContext, permission: string) => {
          if (permission === "project.update") {
            return overrides.updateProjectIds === undefined
              ? [PROJECT_ID]
              : overrides.updateProjectIds;
          }
          return overrides.readProjectIds === undefined
            ? [PROJECT_ID]
            : overrides.readProjectIds;
        },
      ),
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

describe("SupplierPurchaseBatchAccessService", () => {
  test("isolates view, manage, approve, and finance permissions", async () => {
    const deps = dependencies();
    const { SupplierPurchaseBatchAccessService } = await import(
      "./supplier-purchase-batch-access"
    );
    const service = new SupplierPurchaseBatchAccessService(deps);

    await expect(service.requireView(auth([
      "supplier.purchase-requisition.view",
    ]))).resolves.toEqual({
      tenantId: TENANT_ID,
      authUserId: USER_ID,
      employeeId: EMPLOYEE_ID,
    });
    await service.requireManage(auth(["supplier.purchase-requisition.manage"]));
    await service.requireApprove(auth(["supplier.purchase-requisition.approve"]));
    await expect(service.requireActorScope(auth([]))).resolves.toMatchObject({
      tenantId: TENANT_ID, authUserId: USER_ID, employeeId: EMPLOYEE_ID,
    });
    service.requireFinanceBudgetManage(auth(["finance.budget.manage"]));
    expect(() => service.requireFinanceBudgetManage(auth([]))).toThrow();

    expect(deps.accessPolicy.assertPermission.mock.calls.map((call) => call[1]))
      .toEqual([
        "supplier.purchase-requisition.view",
        "supplier.purchase-requisition.manage",
        "supplier.purchase-requisition.approve",
        "finance.budget.manage",
        "finance.budget.manage",
      ]);
    expect(deps.repository.getSettings).toHaveBeenCalledTimes(4);
  });

  test("fails closed for tenant, permission, actor, and module boundaries", async () => {
    const { SupplierPurchaseBatchAccessService } = await import(
      "./supplier-purchase-batch-access"
    );
    const cases = [
      {
        service: new SupplierPurchaseBatchAccessService(dependencies()),
        context: auth(["supplier.purchase-requisition.view"], {
          tenantId: null,
        }),
        actorOnly: true,
        code: "TENANT_CONTEXT_REQUIRED",
      },
      {
        service: new SupplierPurchaseBatchAccessService(dependencies()),
        context: auth([]),
        code: "FORBIDDEN",
      },
      {
        service: new SupplierPurchaseBatchAccessService(dependencies()),
        context: auth(["supplier.purchase-requisition.view"], {
          employeeId: null,
        }),
        actorOnly: true,
        code: "FORBIDDEN",
      },
      {
        service: new SupplierPurchaseBatchAccessService(dependencies()),
        context: auth(["supplier.purchase-requisition.view"], {
          authUserId: "",
        }),
        actorOnly: true,
        code: "FORBIDDEN",
      },
      {
        service: new SupplierPurchaseBatchAccessService(dependencies({
          moduleEnabled: false,
        })),
        context: auth(["supplier.purchase-requisition.view"]),
        actorOnly: true,
        code: "SUPPLIER_MODULE_DISABLED",
      },
    ];

    for (const item of cases) {
      const result = item.actorOnly
        ? item.service.requireActorScope(item.context)
        : item.service.requireView(item.context);
      await expect(result).rejects.toMatchObject({
        code: item.code,
      });
    }
  });

  test("keeps project read and update scopes independent", async () => {
    const deps = dependencies({
      readProjectIds: null,
      updateProjectIds: [PROJECT_ID],
    });
    const { SupplierPurchaseBatchAccessService } = await import(
      "./supplier-purchase-batch-access"
    );
    const service = new SupplierPurchaseBatchAccessService(deps);
    const context = auth(["project.read", "project.update"]);

    expect(await service.getVisibleProjectIds(context)).toBeNull();
    expect(await service.getVisibleProjectUpdateIds(context)).toEqual([
      PROJECT_ID,
    ]);
    await service.assertProjectRead(context, PROJECT_ID);
    await service.assertProjectUpdate(context, PROJECT_ID);

    expect(deps.accessPolicy.getVisibleProjectIds).toHaveBeenNthCalledWith(
      1,
      context,
      "project.read",
    );
    expect(deps.accessPolicy.getVisibleProjectIds).toHaveBeenNthCalledWith(
      2,
      context,
      "project.update",
    );
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
  });

  test("rejects projects outside their effective scope", async () => {
    const { SupplierPurchaseBatchAccessService } = await import(
      "./supplier-purchase-batch-access"
    );
    const service = new SupplierPurchaseBatchAccessService(dependencies({
      projectAccess: false,
    }));
    const context = auth(["project.read", "project.update"]);

    await expect(service.assertProjectRead(context, PROJECT_ID))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.assertProjectUpdate(context, PROJECT_ID))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("deriveSupplierPurchaseBatchActions workflow projection", () => {
  test("uses workflow task access instead of fixed approval permission", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const base = {
      status: "pending_approval" as const,
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: CREATOR_ID,
      actorEmployeeId: EMPLOYEE_ID,
      permissions: ["supplier.purchase-requisition.approve"],
      canReadProject: true,
      canUpdateProject: false,
      workflowEnabled: true,
      workflowCanWithdraw: false,
    };

    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      workflowCanReview: false,
    }).can_review).toBeFalse();
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      permissions: [],
      workflowCanReview: true,
    }).can_review).toBeTrue();
  });

  test("lets the workflow applicant withdraw and edit a rejection", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const permissions = ["supplier.purchase-requisition.manage"];

    expect(deriveSupplierPurchaseBatchActions({
      status: "pending_approval",
      createdByEmployeeId: EMPLOYEE_ID,
      submittedByEmployeeId: EMPLOYEE_ID,
      actorEmployeeId: EMPLOYEE_ID,
      permissions,
      canReadProject: true,
      canUpdateProject: true,
      workflowEnabled: true,
      workflowCanReview: false,
      workflowCanWithdraw: true,
    }).can_withdraw).toBeTrue();

    expect(deriveSupplierPurchaseBatchActions({
      status: "rejected",
      createdByEmployeeId: EMPLOYEE_ID,
      submittedByEmployeeId: EMPLOYEE_ID,
      actorEmployeeId: EMPLOYEE_ID,
      permissions,
      canReadProject: true,
      canUpdateProject: true,
      workflowEnabled: true,
      workflowCanReview: false,
      workflowCanWithdraw: false,
    })).toMatchObject({ can_edit: true, can_submit: false });
  });

  test("opens rejected editing only to the workflow submitter while enabled", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const base = {
      status: "rejected" as const,
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: EMPLOYEE_ID,
      actorEmployeeId: EMPLOYEE_ID,
      permissions: ["supplier.purchase-requisition.manage"],
      canReadProject: true,
      canUpdateProject: true,
      workflowCanReview: false,
      workflowCanWithdraw: false,
    };

    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      workflowEnabled: true,
    }).can_edit).toBeTrue();
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      workflowEnabled: false,
    }).can_edit).toBeFalse();
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      actorEmployeeId: CREATOR_ID,
      workflowEnabled: true,
    }).can_edit).toBeFalse();
  });
});

describe("deriveSupplierPurchaseBatchActions", () => {
  test("enables draft mutations and independently gated master-data actions", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const result = deriveSupplierPurchaseBatchActions({
      status: "draft",
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: null,
      actorEmployeeId: EMPLOYEE_ID,
      permissions: [
        "supplier.purchase-requisition.manage",
        "supplier.master.manage",
        "supplier.catalog.manage",
        "supplier.product.manage",
        "supplier.cost-price.manage",
      ],
      canReadProject: true,
      canUpdateProject: true,
    });

    expect(result).toEqual({
      can_edit: true,
      can_submit: true,
      can_review: false,
      can_withdraw: false,
      can_cancel: true,
      can_create_supplier: true,
      can_create_catalog: true,
      can_create_purchasable_product: true,
    });
  });

  test("requires both product and cost-price permissions for product creation", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const base = {
      status: "draft" as const,
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: null,
      actorEmployeeId: EMPLOYEE_ID,
      canReadProject: true,
      canUpdateProject: true,
    };

    for (const permissions of [
      ["supplier.purchase-requisition.manage", "supplier.product.manage"],
      ["supplier.purchase-requisition.manage", "supplier.cost-price.manage"],
    ]) {
      expect(deriveSupplierPurchaseBatchActions({ ...base, permissions })
        .can_create_purchasable_product).toBe(false);
    }
  });

  test("allows only a non-creator scoped approver to review", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const base = {
      status: "pending_approval" as const,
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: null,
      permissions: ["supplier.purchase-requisition.approve"],
      canReadProject: true,
      canUpdateProject: false,
    };

    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      actorEmployeeId: EMPLOYEE_ID,
    }).can_review).toBe(true);
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      actorEmployeeId: CREATOR_ID,
    }).can_review).toBe(false);
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      submittedByEmployeeId: EMPLOYEE_ID,
      actorEmployeeId: EMPLOYEE_ID,
    }).can_review).toBe(false);
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      actorEmployeeId: null,
    }).can_review).toBe(false);
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      actorEmployeeId: EMPLOYEE_ID,
      canReadProject: false,
    }).can_review).toBe(false);
  });

  test("keeps rejection available while finance approval stays command-scoped", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const base = {
      status: "pending_approval" as const,
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: null,
      actorEmployeeId: EMPLOYEE_ID,
      canReadProject: true,
      canUpdateProject: false,
    };

    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      permissions: ["supplier.purchase-requisition.approve"],
    }).can_review).toBe(true);
    expect(deriveSupplierPurchaseBatchActions({
      ...base,
      permissions: [
        "supplier.purchase-requisition.approve",
        "finance.budget.manage",
      ],
    }).can_review).toBe(true);
  });

  test("offers cancel only for draft or rejected and reserves pending for withdraw", async () => {
    const { deriveSupplierPurchaseBatchActions } = await import(
      "./supplier-purchase-batch-access"
    );
    const pending = deriveSupplierPurchaseBatchActions({
      status: "pending_approval",
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: null,
      actorEmployeeId: EMPLOYEE_ID,
      permissions: ["supplier.purchase-requisition.manage"],
      canReadProject: true,
      canUpdateProject: true,
    });
    expect(pending.can_cancel).toBe(false);
    expect(pending.can_edit).toBe(false);
    expect(pending.can_submit).toBe(false);

    expect(deriveSupplierPurchaseBatchActions({
      status: "rejected",
      createdByEmployeeId: CREATOR_ID,
      submittedByEmployeeId: CREATOR_ID,
      actorEmployeeId: EMPLOYEE_ID,
      permissions: ["supplier.purchase-requisition.manage"],
      canReadProject: true,
      canUpdateProject: true,
      workflowEnabled: true,
    }).can_cancel).toBeTrue();

    for (const status of ["cancelled", "ordered"] as const) {
      expect(deriveSupplierPurchaseBatchActions({
        status,
        createdByEmployeeId: CREATOR_ID,
        submittedByEmployeeId: null,
        actorEmployeeId: EMPLOYEE_ID,
        permissions: [
          "supplier.purchase-requisition.manage",
          "supplier.purchase-requisition.approve",
          "finance.budget.manage",
          "supplier.master.manage",
          "supplier.catalog.manage",
          "supplier.product.manage",
          "supplier.cost-price.manage",
        ],
        canReadProject: true,
        canUpdateProject: true,
      })).toEqual({
        can_edit: false,
        can_submit: false,
        can_review: false,
        can_withdraw: false,
        can_cancel: false,
        can_create_supplier: false,
        can_create_catalog: false,
        can_create_purchasable_product: false,
      });
    }
  });
});

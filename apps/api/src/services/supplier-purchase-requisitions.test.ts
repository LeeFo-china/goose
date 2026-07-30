import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "63000000-0000-4000-8000-000000000001";
const REQUISITION_ID = "63000000-0000-4000-8000-000000000002";
const PROJECT_ID = "63000000-0000-4000-8000-000000000003";
const OTHER_PROJECT_ID = "63000000-0000-4000-8000-000000000004";
const RELATIONSHIP_ID = "63000000-0000-4000-8000-000000000005";
const OTHER_RELATIONSHIP_ID = "63000000-0000-4000-8000-000000000006";
const USER_ID = "63000000-0000-4000-8000-000000000007";
const EMPLOYEE_ID = "63000000-0000-4000-8000-000000000008";
const REVIEWER_ID = "63000000-0000-4000-8000-000000000009";
const PURCHASE_ORDER_ID = "63000000-0000-4000-8000-000000000010";

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: REVIEWER_ID,
    tenantId: TENANT_ID,
    tenantName: "测试租户",
    tenantSlug: "test",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "审批人",
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
    permissions: [],
    ...overrides,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const events: string[] = [];
  const scope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: REVIEWER_ID,
  };
  const requisition = {
    id: REQUISITION_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    tenant_supplier_id: RELATIONSHIP_ID,
    created_by_employee_id: EMPLOYEE_ID,
    budget_status: "within_budget",
    ...overrides,
  };
  return {
    events,
    access: {
      requireView: mock(async () => scope),
      requireManage: mock(async () => scope),
      requireApprove: mock(async () => scope),
      requireFinanceBudgetManage: mock(async () => {
        events.push("finance");
      }),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => {
        events.push("project-read");
      }),
      assertProjectUpdate: mock(async () => {
        events.push("project-update");
      }),
    },
    repository: {
      listRequisitions: mock(async (input: unknown) => ({ input })),
      findRequisition: mock(async () => ({
        requisition,
        budget_snapshots: [],
      })),
      listItems: mock(async (input: unknown) => ({ input })),
      saveDraft: mock(async (input: unknown) => {
        events.push("save");
        return { input };
      }),
      submit: mock(async (input: unknown) => {
        events.push("submit");
        return { input };
      }),
      review: mock(async (input: unknown) => {
        events.push("review");
        return { input };
      }),
      cancel: mock(async (input: unknown) => {
        events.push("cancel");
        return { input };
      }),
      convert: mock(async (input: unknown) => {
        events.push("convert");
        return { input };
      }),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrder: mock(async () => {
        events.push("supplier");
      }),
    },
  };
}

async function serviceFor(
  overrides: Record<string, unknown> = {},
) {
  const deps = dependencies(overrides);
  const { SupplierPurchaseRequisitionsService } = await import(
    "./supplier-purchase-requisitions"
  );
  return {
    deps,
    service: new SupplierPurchaseRequisitionsService(deps as never),
  };
}

describe("SupplierPurchaseRequisitionAccessService", () => {
  test.each([
    [{ tenantId: null }, "TENANT_CONTEXT_REQUIRED"],
    [{ authUserId: "" }, "FORBIDDEN"],
    [{ employeeId: null }, "FORBIDDEN"],
  ] as const)(
    "rejects incomplete actor scope before settings access",
    async (overrides, code) => {
      const getSettings = mock(async () => ({
        tenant_id: TENANT_ID,
        module_enabled: true,
      }));
      const accessPolicy = {
        assertTenantContext: mock((context: AuthContext) => {
          if (!context.tenantId) {
            throw Errors.business(
              403,
              "缺少租户上下文",
              "TENANT_CONTEXT_REQUIRED",
            );
          }
          return context.tenantId;
        }),
        assertPermission: mock(() => undefined),
        getVisibleProjectIds: mock(async () => [PROJECT_ID]),
        canAccessProject: mock(async () => true),
      };
      const { SupplierPurchaseRequisitionAccessService } = await import(
        "./supplier-purchase-requisition-access"
      );
      const access = new SupplierPurchaseRequisitionAccessService({
        accessPolicy,
        repository: { getSettings },
      } as never);

      await expect(access.requireView(auth(overrides)))
        .rejects.toMatchObject({ code });
      expect(getSettings).not.toHaveBeenCalled();
    },
  );

  test("uses requisition permissions and existing project scope semantics", async () => {
    const permissions: string[] = [];
    const accessPolicy = {
      assertTenantContext: mock(() => TENANT_ID),
      assertPermission: mock((_auth: AuthContext, permission: string) => {
        permissions.push(permission);
      }),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      canAccessProject: mock(async () => true),
    };
    const getSettings = mock(async () => ({
      tenant_id: TENANT_ID,
      module_enabled: true,
    }));
    const { SupplierPurchaseRequisitionAccessService } = await import(
      "./supplier-purchase-requisition-access"
    );
    const access = new SupplierPurchaseRequisitionAccessService({
      accessPolicy,
      repository: { getSettings },
    } as never);
    const context = auth();

    await access.requireView(context);
    await access.requireManage(context);
    await access.requireApprove(context);
    access.requireFinanceBudgetManage(context);
    await access.getVisibleProjectIds(context);
    await access.assertProjectRead(context, PROJECT_ID);
    await access.assertProjectUpdate(context, PROJECT_ID);

    expect(permissions).toEqual([
      "supplier.purchase-requisition.view",
      "supplier.purchase-requisition.manage",
      "supplier.purchase-requisition.approve",
      "finance.budget.manage",
    ]);
    expect(accessPolicy.getVisibleProjectIds).toHaveBeenCalledWith(
      context,
      "project.read",
    );
    expect(accessPolicy.canAccessProject).toHaveBeenNthCalledWith(
      1,
      context,
      PROJECT_ID,
      "project.read",
    );
    expect(accessPolicy.canAccessProject).toHaveBeenNthCalledWith(
      2,
      context,
      PROJECT_ID,
      "project.update",
    );
    expect(getSettings).toHaveBeenCalledTimes(3);
  });
});

describe("SupplierPurchaseRequisitionsService", () => {
  test.each([
    ["tenant", "TENANT_CONTEXT_REQUIRED"],
    ["auth user", "FORBIDDEN"],
    ["employee", "FORBIDDEN"],
    ["permission", "FORBIDDEN"],
  ])("stops before repository when %s access is missing", async (
    _boundary,
    code,
  ) => {
    const { deps, service } = await serviceFor();
    deps.access.requireView.mockImplementation(async () => {
      throw code === "TENANT_CONTEXT_REQUIRED"
        ? Errors.business(403, "缺少租户上下文", code)
        : Errors.forbidden();
    });

    await expect(service.listRequisitions(auth(), {
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ code });
    expect(deps.repository.listRequisitions).not.toHaveBeenCalled();
  });

  test("intersects list filters with visible project scope", async () => {
    const { deps, service } = await serviceFor();

    await service.listRequisitions(auth(), {
      page: 2,
      pageSize: 100,
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      budget_status: "over_budget",
    });

    expect(deps.repository.listRequisitions).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      visible_project_ids: [PROJECT_ID],
      page: 2,
      pageSize: 100,
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      budget_status: "over_budget",
    });
  });

  test("loads tenant detail before project.read and paginates items", async () => {
    const { deps, service } = await serviceFor();

    await service.getRequisition(auth(), REQUISITION_ID);
    await service.listItems(auth(), REQUISITION_ID, {
      page: 3,
      pageSize: 20,
    });

    expect(deps.repository.findRequisition).toHaveBeenCalledWith(
      TENANT_ID,
      REQUISITION_ID,
    );
    expect(deps.access.assertProjectRead).toHaveBeenCalledTimes(2);
    expect(deps.repository.listItems).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      page: 3,
      pageSize: 20,
    });
  });

  test("checks new and existing draft scope before save", async () => {
    const { deps, service } = await serviceFor();
    const input = {
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_version: 0,
      reason: "现场临时补料",
      items: [{
        supplier_sku_id: "63000000-0000-4000-8000-000000000011",
        cost_category_id: "63000000-0000-4000-8000-000000000012",
        quantity: "2.5000",
      }],
    };

    await service.saveDraft(
      auth(),
      REQUISITION_ID,
      input,
      "requisition:save:new",
    );
    await service.saveDraft(
      auth(),
      REQUISITION_ID,
      { ...input, expected_version: 1 },
      "requisition:save:old",
    );

    expect(deps.access.assertProjectUpdate).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      PROJECT_ID,
    );
    expect(deps.access.assertProjectUpdate).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      PROJECT_ID,
    );
    expect(deps.repository.saveDraft).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        requisition_id: REQUISITION_ID,
        actor_user_id: USER_ID,
        actor_employee_id: REVIEWER_ID,
        idempotency_key: "requisition:save:old",
      }),
    );
  });

  test("rejects changing an existing draft project or supplier", async () => {
    const { deps, service } = await serviceFor();

    await expect(service.saveDraft(auth(), REQUISITION_ID, {
      project_id: OTHER_PROJECT_ID,
      tenant_supplier_id: OTHER_RELATIONSHIP_ID,
      expected_version: 1,
      reason: "现场临时补料",
      items: [{
        supplier_sku_id: "63000000-0000-4000-8000-000000000011",
        cost_category_id: "63000000-0000-4000-8000-000000000012",
        quantity: "1",
      }],
    }, "requisition:save")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT",
    });
    expect(deps.repository.saveDraft).not.toHaveBeenCalled();
  });

  test("checks project and supplier eligibility before submit mutation", async () => {
    const { deps, service } = await serviceFor();

    await service.submit(
      auth(),
      REQUISITION_ID,
      { expected_version: 2 },
      "requisition:submit",
    );

    expect(deps.events).toEqual([
      "project-update",
      "supplier",
      "submit",
    ]);
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrder)
      .toHaveBeenCalledWith(auth(), RELATIONSHIP_ID);
    expect(deps.repository.submit).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      expected_version: 2,
      actor_user_id: USER_ID,
      actor_employee_id: REVIEWER_ID,
      idempotency_key: "requisition:submit",
    });
  });

  test("rejects self-review before finance permission and mutation", async () => {
    const { deps, service } = await serviceFor({
      created_by_employee_id: REVIEWER_ID,
      budget_status: "over_budget",
    });

    await expect(service.review(auth(), REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:review")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_REQUISITION_SELF_REVIEW",
    });
    expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
    expect(deps.repository.review).not.toHaveBeenCalled();
  });

  test.each([
    ["within_budget", "approve", false],
    ["over_budget", "approve", true],
    ["over_budget", "reject", false],
  ] as const)(
    "reviews %s with %s using the exact budget permission",
    async (budgetStatus, action, requiresFinance) => {
      const { deps, service } = await serviceFor({
        budget_status: budgetStatus,
      });

      await service.review(auth(), REQUISITION_ID, {
        expected_version: 2,
        action,
        remark: action === "approve" ? "同意" : "驳回",
      }, `requisition:${action}`);

      expect(deps.access.requireApprove).toHaveBeenCalledWith(auth());
      expect(deps.access.assertProjectRead).toHaveBeenCalledWith(
        auth(),
        PROJECT_ID,
      );
      if (requiresFinance) {
        expect(deps.access.requireFinanceBudgetManage)
          .toHaveBeenCalledWith(auth());
      } else {
        expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
      }
      expect(deps.repository.review).toHaveBeenCalledWith(
        expect.objectContaining({
          requisition_id: REQUISITION_ID,
          action,
          actor_employee_id: REVIEWER_ID,
        }),
      );
    },
  );

  test("passes actor scope and requested order id to cancel and convert", async () => {
    const { deps, service } = await serviceFor();

    await service.cancel(auth(), REQUISITION_ID, {
      expected_version: 2,
      reason: "计划调整",
    }, "requisition:cancel");
    await service.convert(auth(), REQUISITION_ID, {
      expected_version: 3,
      purchase_order_id: PURCHASE_ORDER_ID,
    }, "requisition:convert");

    expect(deps.repository.cancel).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        actor_user_id: USER_ID,
        actor_employee_id: REVIEWER_ID,
      }),
    );
    expect(deps.repository.convert).toHaveBeenCalledWith(
      expect.objectContaining({
        requisition_id: REQUISITION_ID,
        purchase_order_id: PURCHASE_ORDER_ID,
      }),
    );
  });

  test("returns stable not-found without project checks", async () => {
    const { deps, service } = await serviceFor();
    deps.repository.findRequisition.mockImplementation(
      async () => null as never,
    );

    await expect(service.getRequisition(auth(), REQUISITION_ID))
      .rejects.toMatchObject({
        statusCode: 404,
        code: "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
      });
    expect(deps.access.assertProjectRead).not.toHaveBeenCalled();
  });
});

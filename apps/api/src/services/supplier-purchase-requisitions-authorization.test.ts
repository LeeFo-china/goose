import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "66000000-0000-4000-8000-000000000001";
const REQUISITION_ID = "66000000-0000-4000-8000-000000000002";
const PROJECT_ID = "66000000-0000-4000-8000-000000000003";
const RELATIONSHIP_ID = "66000000-0000-4000-8000-000000000004";
const USER_ID = "66000000-0000-4000-8000-000000000005";
const REQUESTER_ID = "66000000-0000-4000-8000-000000000006";
const REVIEWER_ID = "66000000-0000-4000-8000-000000000007";

const auth = {
  tenantId: TENANT_ID,
  authUserId: USER_ID,
  employeeId: REVIEWER_ID,
  permissions: [],
} as unknown as AuthContext;

function dependencies(options: {
  readProjects?: string[] | null;
  updateProjects?: string[] | null;
  scopeFound?: boolean;
  budgetStatus?: "within_budget" | "over_budget";
  status?: "draft" | "pending_approval";
  version?: number;
} = {}) {
  const events: string[] = [];
  const actorScope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: REVIEWER_ID,
  };
  const requisitionScope = {
    id: REQUISITION_ID,
    project_id: PROJECT_ID,
    tenant_supplier_id: RELATIONSHIP_ID,
    created_by_employee_id: REQUESTER_ID,
    budget_status: options.budgetStatus ?? "within_budget",
    status: options.status ?? "pending_approval",
    version: options.version ?? 2,
  };
  const detail = {
    requisition: {
      ...requisitionScope,
      tenant_id: TENANT_ID,
    },
    budget_snapshots: [],
  };
  return {
    events,
    requisitionScope,
    access: {
      requireView: mock(async () => actorScope),
      requireManage: mock(async () => actorScope),
      requireApprove: mock(async () => actorScope),
      requireFinanceBudgetManage: mock(async () => {
        events.push("finance");
      }),
      getVisibleProjectIds: mock(async () => {
        events.push("read-visible");
        return options.readProjects === undefined
          ? [PROJECT_ID]
          : options.readProjects;
      }),
      getVisibleProjectUpdateIds: mock(async () => {
        events.push("update-visible");
        return options.updateProjects === undefined
          ? [PROJECT_ID]
          : options.updateProjects;
      }),
      assertProjectRead: mock(async () => {
        events.push("project-read");
      }),
      assertProjectUpdate: mock(async () => {
        events.push("project-update");
      }),
    },
    repository: {
      listRequisitions: mock(async () => ({ list: [] })),
      findRequisitionScope: mock(async () => {
        events.push("scope");
        return options.scopeFound === false ? null : requisitionScope;
      }),
      findRequisition: mock(async () => {
        events.push("detail");
        return detail;
      }),
      listItems: mock(async () => {
        events.push("items");
        return { list: [] };
      }),
      saveDraft: mock(async () => {
        events.push("save");
        return { status: "saved" };
      }),
      submit: mock(async () => {
        events.push("submit");
        return { status: "submitted" };
      }),
      review: mock(async () => {
        events.push("review");
        return { status: "approved" };
      }),
      cancel: mock(async () => {
        events.push("cancel");
        return { status: "cancelled" };
      }),
      convert: mock(async () => {
        events.push("convert");
        return { status: "converted" };
      }),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrder: mock(async () => {
        events.push("eligibility-auth");
      }),
      assertCanCreatePurchaseOrderForTenant: mock(async () => {
        events.push("eligibility-tenant");
      }),
    },
  };
}

async function serviceFor(
  options: Parameters<typeof dependencies>[0] = {},
) {
  const deps = dependencies(options);
  const { SupplierPurchaseRequisitionsService } = await import(
    "./supplier-purchase-requisitions"
  );
  return {
    deps,
    service: new SupplierPurchaseRequisitionsService(deps as never),
  };
}

describe("SupplierPurchaseRequisitionsService scoped authorization", () => {
  test("authorizes detail with a minimal lookup before loading full facts", async () => {
    const { deps, service } = await serviceFor();

    await service.getRequisition(auth, REQUISITION_ID);

    expect(deps.events).toEqual(["read-visible", "scope", "detail"]);
    expect(deps.repository.findRequisitionScope).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      visible_project_ids: [PROJECT_ID],
    });
  });

  test("authorizes items without loading full detail or budget snapshots", async () => {
    const { deps, service } = await serviceFor();

    await service.listItems(auth, REQUISITION_ID, {
      page: 2,
      pageSize: 20,
    });

    expect(deps.events).toEqual(["read-visible", "scope", "items"]);
    expect(deps.repository.findRequisition).not.toHaveBeenCalled();
    expect(deps.repository.listItems).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      requisition_id: REQUISITION_ID,
      page: 2,
      pageSize: 20,
    });
  });

  test("submits with update scope and tenant-derived supplier eligibility", async () => {
    const { deps, service } = await serviceFor();

    await service.submit(
      auth,
      REQUISITION_ID,
      { expected_version: 2 },
      "requisition:submit",
    );

    expect(deps.events).toEqual([
      "update-visible",
      "scope",
      "eligibility-tenant",
      "submit",
    ]);
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrderForTenant)
      .toHaveBeenCalledWith(TENANT_ID, RELATIONSHIP_ID);
    expect(deps.tenantSuppliers.assertCanCreatePurchaseOrder)
      .not.toHaveBeenCalled();
    expect(deps.repository.findRequisition).not.toHaveBeenCalled();
  });

  test("reviews with read scope before self and budget decisions", async () => {
    const { deps, service } = await serviceFor({
      budgetStatus: "over_budget",
    });

    await service.review(auth, REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:review");

    expect(deps.events).toEqual([
      "read-visible",
      "scope",
      "finance",
      "review",
    ]);
    expect(deps.repository.findRequisition).not.toHaveBeenCalled();
  });

  test("rejects a non-pending snapshot before finance or review RPC", async () => {
    const { deps, service } = await serviceFor({
      status: "draft",
      version: 1,
    });

    await expect(service.review(auth, REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:review")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_REQUISITION_STATE_CONFLICT",
    });
    expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
    expect(deps.repository.review).not.toHaveBeenCalled();
  });

  test("rejects a future requested version before finance or review RPC", async () => {
    const { deps, service } = await serviceFor({
      budgetStatus: "over_budget",
      version: 1,
    });

    await expect(service.review(auth, REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:review")).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
    });
    expect(deps.access.requireFinanceBudgetManage).not.toHaveBeenCalled();
    expect(deps.repository.review).not.toHaveBeenCalled();
  });

  test("keeps finance mandatory for a matching over-budget snapshot", async () => {
    const { deps, service } = await serviceFor({
      budgetStatus: "over_budget",
      version: 2,
    });
    deps.access.requireFinanceBudgetManage.mockImplementation(async () => {
      throw Errors.forbidden();
    });

    await expect(service.review(auth, REQUISITION_ID, {
      expected_version: 2,
      action: "approve",
    }, "requisition:review")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(deps.repository.review).not.toHaveBeenCalled();
  });

  test.each([
    ["within_budget", false],
    ["over_budget", true],
  ] as const)(
    "passes matching %s version unchanged to review RPC",
    async (budgetStatus, requiresFinance) => {
      const { deps, service } = await serviceFor({
        budgetStatus,
        version: 2,
      });

      await service.review(auth, REQUISITION_ID, {
        expected_version: 2,
        action: "approve",
      }, "requisition:review");

      expect(deps.access.requireFinanceBudgetManage)
        .toHaveBeenCalledTimes(requiresFinance ? 1 : 0);
      expect(deps.repository.review).toHaveBeenCalledWith(
        expect.objectContaining({ expected_version: 2 }),
      );
    },
  );

  test("scopes existing save, cancel, and convert without full detail", async () => {
    const { deps, service } = await serviceFor();
    await service.saveDraft(auth, REQUISITION_ID, {
      project_id: PROJECT_ID,
      tenant_supplier_id: RELATIONSHIP_ID,
      expected_version: 1,
      reason: "现场临时补料",
      items: [{
        supplier_sku_id: "66000000-0000-4000-8000-000000000008",
        cost_category_id: "66000000-0000-4000-8000-000000000009",
        quantity: "1",
      }],
    }, "requisition:save");
    await service.cancel(auth, REQUISITION_ID, {
      expected_version: 2,
      reason: "计划调整",
    }, "requisition:cancel");
    await service.convert(auth, REQUISITION_ID, {
      expected_version: 3,
      purchase_order_id: "66000000-0000-4000-8000-000000000010",
    }, "requisition:convert");

    expect(deps.events).toEqual([
      "update-visible",
      "scope",
      "save",
      "update-visible",
      "scope",
      "cancel",
      "update-visible",
      "scope",
      "convert",
    ]);
    expect(deps.repository.findRequisition).not.toHaveBeenCalled();
    expect(deps.repository.findRequisitionScope).toHaveBeenCalledTimes(3);
  });

  test.each([
    ["detail", [] as string[], "getRequisition"],
    ["items", [] as string[], "listItems"],
    ["hidden mutation", ["66000000-0000-4000-8000-000000000099"], "submit"],
  ] as const)(
    "returns one not-found shape for %s outside project scope",
    async (_case, projects, method) => {
      const isRead = method !== "submit";
      const { deps, service } = await serviceFor({
        ...(isRead ? { readProjects: [...projects] } : {
          updateProjects: [...projects],
        }),
        scopeFound: false,
      });

      const operation = method === "getRequisition"
        ? service.getRequisition(auth, REQUISITION_ID)
        : method === "listItems"
        ? service.listItems(auth, REQUISITION_ID, {
          page: 1,
          pageSize: 20,
        })
        : service.submit(
          auth,
          REQUISITION_ID,
          { expected_version: 2 },
          "requisition:submit",
        );
      await expect(operation).rejects.toMatchObject({
        statusCode: 404,
        code: "SUPPLIER_PURCHASE_REQUISITION_NOT_FOUND",
      });
      expect(deps.repository.findRequisition).not.toHaveBeenCalled();
      expect(deps.repository.listItems).not.toHaveBeenCalled();
      expect(deps.repository.submit).not.toHaveBeenCalled();
      expect(deps.tenantSuppliers.assertCanCreatePurchaseOrderForTenant)
        .not.toHaveBeenCalled();
    },
  );

  test.each([
    ["manage", "requireManage"],
    ["approve", "requireApprove"],
  ] as const)(
    "stops before every repository when %s permission fails",
    async (_permission, accessMethod) => {
      const { deps, service } = await serviceFor();
      deps.access[accessMethod].mockImplementation(async () => {
        throw Errors.forbidden();
      });

      const operation = accessMethod === "requireManage"
        ? service.submit(
          auth,
          REQUISITION_ID,
          { expected_version: 2 },
          "requisition:submit",
        )
        : service.review(auth, REQUISITION_ID, {
          expected_version: 2,
          action: "reject",
        }, "requisition:review");
      await expect(operation).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(deps.repository.findRequisitionScope).not.toHaveBeenCalled();
      expect(deps.repository.findRequisition).not.toHaveBeenCalled();
      expect(deps.repository.submit).not.toHaveBeenCalled();
      expect(deps.repository.review).not.toHaveBeenCalled();
    },
  );
});

describe("SupplierPurchaseRequisitionAccessService review boundaries", () => {
  test("gets update-visible projects and blocks a disabled module", async () => {
    const getSettings = mock(async () => ({
      tenant_id: TENANT_ID,
      module_enabled: false,
    }));
    const accessPolicy = {
      assertTenantContext: mock(() => TENANT_ID),
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

    expect(await access.getVisibleProjectUpdateIds(auth)).toEqual([
      PROJECT_ID,
    ]);
    expect(accessPolicy.getVisibleProjectIds).toHaveBeenCalledWith(
      auth,
      "project.update",
    );
    await expect(access.requireManage(auth)).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_MODULE_DISABLED",
    });
  });
});

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  ProjectReceivableOperationRecord,
} from "@/repositories/project-receivable-operations";
import type { AuthContext } from "@/services/authorization";

const baseRecord: ProjectReceivableOperationRecord = {
  id: "plan-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  workflow_instance_id: null,
  workflow_node_key: null,
  source_type: "manual",
  source_id: null,
  payment_type: "add_on" as const,
  title: "增项款",
  amount: 3000,
  due_date: "2026-07-05",
  paid_amount: 0,
  status: "pending" as const,
  owner_employee_id: "employee-2",
  latest_follow_up_at: null,
  latest_follow_up_note: null,
  next_follow_up_at: null,
  canceled_at: null,
  canceled_by: null,
  canceled_reason: null,
  created_at: "2026-06-28T10:00:00.000Z",
  updated_at: "2026-06-28T10:00:00.000Z",
};

const findProjectTenant = mock(async () => ({
  id: "project-1",
  tenant_id: "tenant-1",
}));
const findEmployeeTenant = mock(async () => ({
  id: "employee-2",
  tenant_id: "tenant-1",
}));
const findById = mock(async () => baseRecord);
const createManualPlan = mock(async () => baseRecord);
const updatePlan = mock(async (_input?: {
  values?: Record<string, unknown>;
}) => baseRecord);
const cancelPlan = mock(async () => ({
  ...baseRecord,
  status: "canceled" as const,
  canceled_by: "employee-1",
  canceled_reason: "客户取消增项",
}));
const createEvent = mock(async (input: Record<string, unknown>) => ({
  id: "event-1",
  tenant_id: String(input.tenant_id),
  project_id: String(input.project_id),
  receivable_plan_id: String(input.receivable_plan_id),
  event_type: "follow_up" as const,
  title: String(input.title),
  note: typeof input.note === "string" ? input.note : null,
  before_snapshot: null,
  after_snapshot: null,
  next_follow_up_at: null,
  created_by: "employee-1",
  ...input,
  created_at: "2026-06-28T10:00:00.000Z",
  creator: null,
  created_by_name: "财务",
}));
const listByReceivable = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));

mock.module("@/repositories/project-receivable-plans", () => ({
  projectReceivablePlanRepository: {
    findProjectTenant,
  },
}));

mock.module("@/repositories/project-receivable-operations", () => ({
  projectReceivableOperationsRepository: {
    findById,
    findEmployeeTenant,
    createManualPlan,
    updatePlan,
    cancelPlan,
  },
}));

mock.module("@/repositories/project-receivable-events", () => ({
  projectReceivableEventRepository: {
    create: createEvent,
    listByReceivable,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((context: AuthContext) =>
      context.tenantId || "tenant-1"
    ),
    hasPermission: mock((context: AuthContext, permission: string) =>
      context.permissions.some((item) => item.code === permission)
    ),
  },
}));

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "finance.receivable.manage", scope: "all" }],
} satisfies AuthContext;

async function createService() {
  const { ProjectReceivableOperationsService } = await import(
    "./project-receivables-operations"
  );
  return new ProjectReceivableOperationsService({
    planRepository: { findProjectTenant },
    operationsRepository: {
      findById,
      findEmployeeTenant,
      createManualPlan,
      updatePlan,
      cancelPlan,
    },
    eventRepository: {
      create: createEvent,
      listByReceivable,
    },
    accessPolicyService: {
      assertTenantContext: mock((context: AuthContext) =>
        context.tenantId || "tenant-1"
      ),
      hasPermission: mock((context: AuthContext, permission: string) =>
        context.permissions.some((item) => item.code === permission)
      ),
    },
  });
}

describe("projectReceivableOperationsService", () => {
  beforeEach(() => {
    findProjectTenant.mockClear();
    findEmployeeTenant.mockClear();
    findById.mockClear();
    createManualPlan.mockClear();
    updatePlan.mockClear();
    cancelPlan.mockClear();
    createEvent.mockClear();
    listByReceivable.mockClear();
    findById.mockImplementation(async () => baseRecord);
  });

  test("creates manual receivable and writes audit event", async () => {
    const service = await createService();

    const result = await service.createManualReceivable(authContext, {
      project_id: "project-1",
      payment_type: "add_on",
      title: "增项款",
      amount: 3000,
      due_date: "2026-07-05",
      owner_employee_id: "employee-2",
      remark: "客户确认增项",
    });

    expect(result.id).toBe("plan-1");
    expect(createManualPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        project_id: "project-1",
        amount: 3000,
      }),
    );
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "manual_created",
        title: "人工创建应收",
        note: "客户确认增项",
      }),
    );
  });

  test("rejects amount lower than paid amount", async () => {
    findById.mockImplementationOnce(async () => ({
      ...baseRecord,
      paid_amount: 2000,
      status: "partially_paid" as const,
    }));
    const service = await createService();

    await expect(
      service.updateReceivable(authContext, "plan-1", {
        amount: 1000,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RECEIVABLE_AMOUNT_BELOW_PAID",
    });
  });

  test("rejects cancel when receivable already has allocations", async () => {
    findById.mockImplementationOnce(async () => ({
      ...baseRecord,
      paid_amount: 100,
      status: "partially_paid" as const,
    }));
    const service = await createService();

    await expect(
      service.cancelReceivable(authContext, "plan-1", {
        reason: "客户取消增项",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "RECEIVABLE_ALREADY_ALLOCATED",
    });
  });

  test("adjusts due date with dedicated audit event", async () => {
    updatePlan.mockImplementationOnce(async (input) => ({
      ...baseRecord,
      due_date: String(input?.values?.due_date),
    }));
    const service = await createService();

    const result = await service.adjustDueDate(authContext, "plan-1", {
      due_date: "2026-07-20",
      reason: "客户延期付款",
    });

    expect(result.due_date).toBe("2026-07-20");
    expect(updatePlan).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      planId: "plan-1",
      values: {
        due_date: "2026-07-20",
        status: "pending",
      },
    });
    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "adjust_due_date",
        title: "调整应收到期日",
        note: "客户延期付款",
        before_snapshot: expect.objectContaining({ due_date: "2026-07-05" }),
        after_snapshot: expect.objectContaining({ due_date: "2026-07-20" }),
      }),
    );
  });

  test("writes explicit cancel receivable event type", async () => {
    const service = await createService();

    await service.cancelReceivable(authContext, "plan-1", {
      reason: "客户取消增项",
    });

    expect(createEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "cancel_receivable",
        title: "取消应收计划",
        note: "客户取消增项",
      }),
    );
  });

  test("creates follow-up and updates receivable summary fields", async () => {
    const service = await createService();

    const result = await service.createFollowUp(authContext, "plan-1", {
      note: "已电话沟通",
      next_follow_up_at: "2026-07-01T09:00:00.000Z",
    });

    expect(result.event_type).toBe("follow_up");
    expect(updatePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        planId: "plan-1",
        values: expect.objectContaining({
          latest_follow_up_note: "已电话沟通",
          next_follow_up_at: "2026-07-01T09:00:00.000Z",
        }),
      }),
    );
  });
});

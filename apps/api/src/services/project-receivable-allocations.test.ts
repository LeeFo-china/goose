import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  ProjectReceivableAllocationRecord,
} from "@/repositories/project-receivable-allocations";
import type {
  ProjectReceivableOperationRecord,
} from "@/repositories/project-receivable-operations";
import type { AuthContext } from "@/services/authorization";

const basePlan: ProjectReceivableOperationRecord = {
  id: "plan-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  workflow_instance_id: null,
  workflow_node_key: null,
  source_type: "manual",
  source_id: null,
  payment_type: "stage_2",
  title: "中期款",
  amount: 10000,
  due_date: "2026-06-29",
  paid_amount: 0,
  status: "pending",
  owner_employee_id: null,
  latest_follow_up_at: null,
  latest_follow_up_note: null,
  next_follow_up_at: null,
  canceled_at: null,
  canceled_by: null,
  canceled_reason: null,
  created_at: "2026-06-29T00:00:00.000Z",
  updated_at: "2026-06-29T00:00:00.000Z",
};

const basePayment = {
  id: "payment-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  amount: 10000,
  status: "confirmed",
  type: "stage_2",
  pay_date: "2026-06-29T00:00:00.000Z",
  remark: "客户转账",
};

const baseAllocation: ProjectReceivableAllocationRecord = {
  id: "allocation-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  receivable_plan_id: "plan-1",
  payment_id: "payment-1",
  amount: 3000,
  allocated_by: "employee-1",
  allocated_at: "2026-06-29T00:00:00.000Z",
  source_type: "manual",
  source_id: "00000000-0000-4000-8000-000000000001",
  metadata: { reason: "核销未分配收款" },
  created_at: "2026-06-29T00:00:00.000Z",
  updated_at: "2026-06-29T00:00:00.000Z",
};

const findReceivableById = mock(async () => basePlan);
const updatePaidAmount = mock(async (input: {
  paidAmount: number;
}) => ({
  ...basePlan,
  paid_amount: input.paidAmount,
  status: input.paidAmount >= basePlan.amount
    ? "paid" as const
    : input.paidAmount > 0
      ? "partially_paid" as const
      : "pending" as const,
}));
const listActiveByReceivable = mock(async () => [baseAllocation]);
const listConfirmedProjectPayments = mock(async () => [{
  ...basePayment,
  allocated_amount: 3000,
  remaining_amount: 7000,
}]);
const findPaymentById = mock(async () => basePayment);
const createAllocation = mock(async () => baseAllocation);
const sumActiveAllocatedAmount = mock(async () => 3000);
const sumActiveAllocatedAmountByPayment = mock(async () => 3000);
const findActiveById = mock(async () => baseAllocation);
const updateAllocationAmount = mock(async (input: {
  amount: number;
}) => ({
  ...baseAllocation,
  amount: input.amount,
}));
const reverseAllocation = mock(async () => ({
  ...baseAllocation,
  reversed_at: "2026-06-29T01:00:00.000Z",
  reversed_by: "employee-1",
  reverse_reason: "错误核销",
}));
const createEvent = mock(async (input: Record<string, unknown>) => ({
  id: "event-1",
  created_at: "2026-06-29T00:00:00.000Z",
  created_by_name: "财务",
  ...input,
}));
const assertTenantContext = mock((context: AuthContext) =>
  context.tenantId || "tenant-1"
);
const hasPermission = mock((context: AuthContext, permission: string) =>
  context.permissions.some((item) => item.code === permission)
);

mock.module("@/repositories/project-receivable-allocations", () => ({
  projectReceivableAllocationRepository: {
    listActiveByReceivable,
    listConfirmedProjectPayments,
    findPaymentById,
    createIdempotent: createAllocation,
    sumActiveAllocatedAmount,
    sumActiveAllocatedAmountByPayment,
    findActiveById,
    updateManualAllocationAmount: updateAllocationAmount,
    reverseManualAllocation: reverseAllocation,
  },
}));

mock.module("@/repositories/project-receivable-events", () => ({
  projectReceivableEventRepository: {
    create: createEvent,
  },
}));

mock.module("@/repositories/project-receivable-operations", () => ({
  projectReceivableOperationsRepository: {
    findById: findReceivableById,
  },
}));

mock.module("@/repositories/project-receivable-plans", () => ({
  projectReceivablePlanRepository: {
    updatePaidAmount,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    hasPermission,
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
  const { ProjectReceivableAllocationsService } = await import(
    "./project-receivable-allocations"
  );
  return new ProjectReceivableAllocationsService({
    receivableRepository: {
      findById: findReceivableById,
    },
    planRepository: {
      updatePaidAmount,
    },
    allocationRepository: {
      listActiveByReceivable,
      listConfirmedProjectPayments,
      findPaymentById,
      createIdempotent: createAllocation,
      sumActiveAllocatedAmount,
      sumActiveAllocatedAmountByPayment,
      findActiveById,
      updateManualAllocationAmount: updateAllocationAmount,
      reverseManualAllocation: reverseAllocation,
    },
    eventRepository: {
      create: createEvent,
    },
    accessPolicyService: {
      assertTenantContext,
      hasPermission,
    },
  });
}

describe("ProjectReceivableAllocationsService", () => {
  beforeEach(() => {
    findReceivableById.mockClear();
    updatePaidAmount.mockClear();
    listActiveByReceivable.mockClear();
    listConfirmedProjectPayments.mockClear();
    findPaymentById.mockClear();
    createAllocation.mockClear();
    sumActiveAllocatedAmount.mockClear();
    sumActiveAllocatedAmountByPayment.mockClear();
    findActiveById.mockClear();
    updateAllocationAmount.mockClear();
    reverseAllocation.mockClear();
    createEvent.mockClear();
    assertTenantContext.mockClear();
    hasPermission.mockClear();

    findReceivableById.mockImplementation(async () => basePlan);
    listActiveByReceivable.mockImplementation(async () => [baseAllocation]);
    listConfirmedProjectPayments.mockImplementation(async () => [{
      ...basePayment,
      allocated_amount: 3000,
      remaining_amount: 7000,
    }]);
    findPaymentById.mockImplementation(async () => basePayment);
    createAllocation.mockImplementation(async () => baseAllocation);
    sumActiveAllocatedAmount.mockImplementation(async () => 3000);
    sumActiveAllocatedAmountByPayment.mockImplementation(async () => 3000);
    findActiveById.mockImplementation(async () => baseAllocation);
    updateAllocationAmount.mockImplementation(async (input: {
      amount: number;
    }) => ({
      ...baseAllocation,
      amount: input.amount,
    }));
    reverseAllocation.mockImplementation(async () => ({
      ...baseAllocation,
      reversed_at: "2026-06-29T01:00:00.000Z",
      reversed_by: "employee-1",
      reverse_reason: "错误核销",
    }));
  });

  test("returns allocation context with active allocations and payment candidates", async () => {
    const service = await createService();

    const result = await service.getAllocationContext(authContext, "plan-1");

    expect(result.receivable_plan.id).toBe("plan-1");
    expect(result.allocations).toHaveLength(1);
    expect(result.payments).toEqual([
      expect.objectContaining({
        id: "payment-1",
        remaining_amount: 7000,
      }),
    ]);
    expect(listActiveByReceivable).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      receivablePlanId: "plan-1",
    });
    expect(listConfirmedProjectPayments).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      pageSize: 100,
    });
  });

  test("creates manual allocation and recalculates receivable paid amount", async () => {
    const service = await createService();

    const result = await service.createManualAllocation(authContext, "plan-1", {
      payment_id: "payment-1",
      amount: 3000,
      reason: "核销未分配收款",
      idempotency_key: "00000000-0000-4000-8000-000000000001",
    });

    expect(result.receivable_plan).toMatchObject({
      id: "plan-1",
      paid_amount: 3000,
      status: "partially_paid",
    });
    expect(createAllocation).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: "tenant-1",
      project_id: "project-1",
      receivable_plan_id: "plan-1",
      payment_id: "payment-1",
      amount: 3000,
      source_type: "manual",
      source_id: "00000000-0000-4000-8000-000000000001",
    }));
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "allocate_payment",
      title: "人工核销收款",
      note: "核销未分配收款",
    }));
  });

  test("rejects allocation that exceeds payment remaining amount", async () => {
    sumActiveAllocatedAmountByPayment.mockImplementationOnce(async () => 9000);
    const service = await createService();

    await expect(service.createManualAllocation(authContext, "plan-1", {
      payment_id: "payment-1",
      amount: 2000,
      reason: "超额核销",
      idempotency_key: "00000000-0000-4000-8000-000000000002",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_ALLOCATION_EXCEEDS_REMAINING",
    });
  });

  test("rejects unconfirmed payment", async () => {
    findPaymentById.mockImplementationOnce(async () => ({
      ...basePayment,
      status: "pending",
    }));
    const service = await createService();

    await expect(service.createManualAllocation(authContext, "plan-1", {
      payment_id: "payment-1",
      amount: 1000,
      reason: "未确认收款",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_NOT_CONFIRMED",
    });
  });

  test("rejects payment from another project", async () => {
    findPaymentById.mockImplementationOnce(async () => ({
      ...basePayment,
      project_id: "project-2",
    }));
    const service = await createService();

    await expect(service.createManualAllocation(authContext, "plan-1", {
      payment_id: "payment-1",
      amount: 1000,
      reason: "项目不一致",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_PROJECT_MISMATCH",
    });
  });

  test("adjusts allocation amount and writes audit event", async () => {
    sumActiveAllocatedAmount
      .mockImplementationOnce(async () => 3000)
      .mockImplementationOnce(async () => 5000);
    sumActiveAllocatedAmountByPayment.mockImplementationOnce(async () => 5000);
    const service = await createService();

    const result = await service.adjustManualAllocation(
      authContext,
      "plan-1",
      "allocation-1",
      {
        amount: 5000,
        reason: "调整核销金额",
      },
    );

    expect(result.receivable_plan.paid_amount).toBe(5000);
    expect(updateAllocationAmount).toHaveBeenCalledWith(expect.objectContaining({
      allocationId: "allocation-1",
      amount: 5000,
    }));
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "adjust_allocation",
      title: "调整核销金额",
    }));
  });

  test("rejects adjustment for non-manual allocation", async () => {
    findActiveById.mockImplementationOnce(async () => ({
      ...baseAllocation,
      source_type: "workflow_task",
    }));
    const service = await createService();

    await expect(service.adjustManualAllocation(
      authContext,
      "plan-1",
      "allocation-1",
      { amount: 5000, reason: "调整核销金额" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "ALLOCATION_NOT_MANUAL",
    });
  });

  test("reverses allocation and excludes it from paid amount", async () => {
    sumActiveAllocatedAmount.mockImplementationOnce(async () => 0);
    const service = await createService();

    const result = await service.reverseManualAllocation(
      authContext,
      "plan-1",
      "allocation-1",
      {
        reason: "错误核销",
      },
    );

    expect(result.receivable_plan.paid_amount).toBe(0);
    expect(reverseAllocation).toHaveBeenCalledWith(expect.objectContaining({
      allocationId: "allocation-1",
      reversedBy: "employee-1",
      reason: "错误核销",
    }));
    expect(createEvent).toHaveBeenCalledWith(expect.objectContaining({
      event_type: "reverse_allocation",
      title: "撤销收款核销",
    }));
  });
});

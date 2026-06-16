import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const callOrder: string[] = [];

const confirmedPayment = {
  id: "payment-1",
  project_id: "project-1",
  amount: 10000,
  type: "stage_2",
  status: "confirmed",
  evidence_images: [{ url: "https://example.com/payment.jpg" }],
  handled_by: "employee-1",
  pay_date: "2026-06-16T10:00:00.000Z",
  workflow_task_id: "task-1",
  source_type: "workflow_task",
  source_id: "task-1",
  remark: "中期款已入账",
  payment_channel: "manual",
  created_at: "2026-06-16T10:00:00.000Z",
};

const findByWorkflowTaskId = mock(
  async (): Promise<typeof confirmedPayment | null> => null,
);
const createPayment = mock(async () => {
  callOrder.push("payment");
  return confirmedPayment;
});
const createProjectPaymentLedger = mock(async () => {
  callOrder.push("ledger");
  return { id: "ledger-1" };
});
const completeRuntimeNode = mock(async () => {
  callOrder.push("workflow");
  return {
    ok: true,
    instance: {},
    completedNode: {},
    nextNode: null,
    task: null,
  };
});
const syncFromRuntimeInstance = mock(async () => ({ id: "state-1" }));

mock.module("@/repositories/payments", () => ({
  paymentRepository: {
    findByWorkflowTaskId,
    create: createPayment,
  },
}));

mock.module("@/services/finance-ledger", () => ({
  financeLedgerService: {
    createProjectPaymentLedger,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {
    completeRuntimeNode,
  },
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance,
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
  permissions: [{ code: "finance.payment.confirm", scope: "all" }],
} satisfies AuthContext;

const bridgeTask = {
  id: "task-1",
  tenant_id: "tenant-1",
  definition_id: "definition-1",
  instance_id: "instance-1",
  node_key: "payment_stage_2",
  instance: {
    subject_id: "project-1",
    current_node_snapshot: {
      node_key: "payment_stage_2",
      business_kind: "payment_collection",
      title: "中期进度款",
      config: {
        payment_type: "stage_2",
      },
    },
  },
};

const output = {
  payment_status: "success",
  amount: 10000,
  paid_at: "2026-06-16T10:00:00.000Z",
  evidence_images: [{ url: "https://example.com/payment.jpg" }],
  remark: "中期款已入账",
};

describe("workflowTaskPaymentBridge", () => {
  test("creates confirmed payment, writes ledger, then completes runtime node", async () => {
    callOrder.length = 0;
    findByWorkflowTaskId.mockImplementation(async () => null);
    const { workflowTaskPaymentBridge } = await import("./workflow-task-payment-bridge");

    const result = await workflowTaskPaymentBridge.complete({
      authContext,
      task: bridgeTask,
      action: "complete",
      output,
    });

    expect(result).toMatchObject({
      result: {
        ok: true,
        bridged: true,
        operation: "confirm_payment",
      },
      payment: confirmedPayment,
      workflow_state: { id: "state-1" },
    });
    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "project-1",
        amount: 10000,
        type: "stage_2",
        status: "confirmed",
        handled_by: "employee-1",
        pay_date: "2026-06-16T10:00:00.000Z",
        workflow_task_id: "task-1",
        source_type: "workflow_task",
        source_id: "task-1",
        payment_channel: "manual",
      }),
    );
    expect(createProjectPaymentLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        project_id: "project-1",
        direction: "in",
        entry_type: "project_payment",
        amount: 10000,
        occurred_at: "2026-06-16T10:00:00.000Z",
        source_type: "workflow_task",
        source_id: "task-1",
        workflow_task_id: "task-1",
        payment_id: "payment-1",
        handled_by: "employee-1",
      }),
    );
    expect(completeRuntimeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        definitionId: "definition-1",
        instanceId: "instance-1",
        nodeKey: "payment_stage_2",
        action: "complete",
        output,
        actorEmployeeId: "employee-1",
      }),
    );
    expect(callOrder).toEqual(["payment", "ledger", "workflow"]);
  });

  test("requires amount and evidence images", async () => {
    const { workflowTaskPaymentBridge } = await import("./workflow-task-payment-bridge");

    await expect(
      workflowTaskPaymentBridge.complete({
        authContext,
        task: bridgeTask,
        action: "complete",
        output: {
          payment_status: "success",
          amount: 100,
          evidence_images: [],
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
  });

  test("reuses existing workflow payment for idempotent retry", async () => {
    callOrder.length = 0;
    createPayment.mockClear();
    findByWorkflowTaskId.mockImplementation(async () => confirmedPayment);
    const { workflowTaskPaymentBridge } = await import("./workflow-task-payment-bridge");

    const result = await workflowTaskPaymentBridge.complete({
      authContext,
      task: bridgeTask,
      action: "complete",
      output,
    });

    expect(result).toMatchObject({
      result: {
        ok: true,
        bridged: true,
        operation: "confirm_payment",
      },
      payment: confirmedPayment,
    });
    expect(createPayment).not.toHaveBeenCalled();
    expect(createProjectPaymentLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "workflow_task",
        source_id: "task-1",
        payment_id: "payment-1",
      }),
    );
    expect(callOrder).toEqual(["ledger", "workflow"]);
  });
});

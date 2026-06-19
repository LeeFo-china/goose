import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PaymentRecord } from "@/repositories/payments";
import type { AuthContext } from "@/services/authorization";
import { WorkflowTaskPaymentBridge } from "./workflow-task-payment-bridge";

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
} satisfies PaymentRecord;

const findByWorkflowTaskId = mock(
  async (): Promise<PaymentRecord | null> => null,
);
const createPayment = mock(async () => {
  callOrder.push("payment");
  return confirmedPayment;
});
const createProjectPaymentLedger = mock(async () => {
  callOrder.push("ledger");
  return { id: "ledger-1" };
});
const completeRuntimeNode = mock(async (): Promise<{ ok: true }> => {
  callOrder.push("workflow");
  return { ok: true };
});
const syncFromRuntimeInstance = mock(async () => ({ id: "state-1" }));

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

function createBridge() {
  return new WorkflowTaskPaymentBridge({
    paymentRepository: {
      findByWorkflowTaskId,
      create: createPayment,
    },
    financeLedgerService: {
      createProjectPaymentLedger,
    },
    workflowRepository: {
      completeRuntimeNode,
    },
    workflowSubjectStateService: {
      syncFromRuntimeInstance,
    },
  });
}

describe("workflowTaskPaymentBridge", () => {
  beforeEach(() => {
    callOrder.length = 0;
    findByWorkflowTaskId.mockClear();
    findByWorkflowTaskId.mockImplementation(async () => null);
    createPayment.mockClear();
    createProjectPaymentLedger.mockClear();
    completeRuntimeNode.mockClear();
    syncFromRuntimeInstance.mockClear();
  });

  test("creates confirmed payment, writes ledger, then completes runtime node", async () => {
    const workflowTaskPaymentBridge = createBridge();

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
    const workflowTaskPaymentBridge = createBridge();

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

  test("requires a friendly payment remark when confirming payment manually", async () => {
    const workflowTaskPaymentBridge = createBridge();

    await expect(
      workflowTaskPaymentBridge.complete({
        authContext,
        task: bridgeTask,
        action: "complete",
        output: {
          payment_status: "success",
          amount: 10000,
          paid_at: "2026-06-16T10:00:00.000Z",
          evidence_images: [{ url: "https://example.com/payment.jpg" }],
          remark: null,
        },
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "请填写收款备注",
    });

    expect(createPayment).not.toHaveBeenCalled();
    expect(createProjectPaymentLedger).not.toHaveBeenCalled();
    expect(completeRuntimeNode).not.toHaveBeenCalled();
  });

  test("reuses existing workflow payment for idempotent retry", async () => {
    findByWorkflowTaskId.mockImplementation(async () => confirmedPayment);
    const workflowTaskPaymentBridge = createBridge();

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

  test("keys ledger by payment for legacy confirmed payment without source fields", async () => {
    const legacyPayment = {
      ...confirmedPayment,
      id: "550e8400-e29b-41d4-a716-446655440011",
      source_type: null,
      source_id: null,
    };
    findByWorkflowTaskId.mockImplementation(async () => legacyPayment);
    const workflowTaskPaymentBridge = createBridge();

    await workflowTaskPaymentBridge.complete({
      authContext,
      task: bridgeTask,
      action: "complete",
      output: {},
    });

    expect(createPayment).not.toHaveBeenCalled();
    expect(createProjectPaymentLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        source_type: "payment",
        source_id: "550e8400-e29b-41d4-a716-446655440011",
        workflow_task_id: "task-1",
        payment_id: "550e8400-e29b-41d4-a716-446655440011",
      }),
    );
    expect(callOrder).toEqual(["ledger", "workflow"]);
  });

  test("completes workflow task from existing confirmed payment without manual output", async () => {
    findByWorkflowTaskId.mockImplementation(async () => ({
      ...confirmedPayment,
      payment_channel: "wechat_pay",
    }));
    const workflowTaskPaymentBridge = createBridge();

    const result = await workflowTaskPaymentBridge.complete({
      authContext,
      task: bridgeTask,
      action: "complete",
      output: {},
    });

    expect(result).toMatchObject({
      result: {
        ok: true,
        bridged: true,
        operation: "confirm_payment",
      },
      payment: expect.objectContaining({
        id: "payment-1",
        payment_channel: "wechat_pay",
      }),
    });
    expect(createPayment).not.toHaveBeenCalled();
    expect(createProjectPaymentLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_id: "payment-1",
        amount: 10000,
        metadata: expect.objectContaining({
          payment_channel: "wechat_pay",
        }),
      }),
    );
    expect(completeRuntimeNode).toHaveBeenCalledWith(
      expect.objectContaining({
        output: {},
      }),
    );
    expect(callOrder).toEqual(["ledger", "workflow"]);
  });

  test("does not complete workflow task from existing unconfirmed payment", async () => {
    findByWorkflowTaskId.mockImplementation(async () => ({
      ...confirmedPayment,
      status: "pending",
      payment_channel: "wechat_pay",
    }));
    const workflowTaskPaymentBridge = createBridge();

    await expect(
      workflowTaskPaymentBridge.complete({
        authContext,
        task: bridgeTask,
        action: "complete",
        output: {},
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });

    expect(createPayment).not.toHaveBeenCalled();
    expect(createProjectPaymentLedger).not.toHaveBeenCalled();
    expect(completeRuntimeNode).not.toHaveBeenCalled();
    expect(callOrder).toEqual([]);
  });
});

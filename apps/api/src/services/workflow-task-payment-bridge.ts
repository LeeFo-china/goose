import { z } from "zod";
import { Errors } from "@/errors/error-factory";
import { paymentRepository, type PaymentRecord } from "@/repositories/payments";
import {
  workflowRepository,
  type JsonObject,
  type WorkflowRuntimeCompleteNodeResult,
} from "@/repositories/workflows";
import type { AuthContext } from "@/services/authorization";
import { financeLedgerService } from "@/services/finance-ledger";
import { workflowSubjectStateService } from "@/services/workflow-subject-state";

const PAYMENT_COLLECTION_TYPES = [
  "deposit",
  "stage_1",
  "stage_2",
  "stage_3",
  "add_on",
] as const;

const PaymentCollectionOutputSchema = z.object({
  payment_status: z.string().trim().optional(),
  amount: z.coerce.number("入账金额必须是数字").positive("入账金额必须大于 0"),
  paid_at: z.string().datetime("无效的入账时间").optional(),
  evidence_images: z.array(z.unknown()).min(1, "请上传收款凭证"),
  remark: z.string().trim().max(500, "收款备注不能超过 500 个字符").optional(),
});

type PaymentCollectionType = (typeof PAYMENT_COLLECTION_TYPES)[number];
type RuntimeCompleteResultForBridge =
  | { ok: true }
  | Extract<WorkflowRuntimeCompleteNodeResult, { ok: false }>;

type WorkflowTaskPaymentBridgeDependencies = {
  paymentRepository: Pick<typeof paymentRepository, "findByWorkflowTaskId" | "create">;
  financeLedgerService: {
    createProjectPaymentLedger: (
      input: Parameters<typeof financeLedgerService.createProjectPaymentLedger>[0],
    ) => Promise<unknown>;
  };
  workflowRepository: {
    completeRuntimeNode: (
      input: Parameters<typeof workflowRepository.completeRuntimeNode>[0],
    ) => Promise<RuntimeCompleteResultForBridge>;
  };
  workflowSubjectStateService: {
    syncFromRuntimeInstance: (
      input: Parameters<typeof workflowSubjectStateService.syncFromRuntimeInstance>[0],
    ) => Promise<unknown>;
  };
};

export type PaymentWorkflowTaskBridgeInput = {
  authContext: AuthContext;
  task: {
    id: string;
    tenant_id: string;
    definition_id: string;
    instance_id: string;
    node_key: string;
    instance: {
      subject_id: string;
      current_node_snapshot: unknown;
    };
  };
  action: string;
  output: Record<string, unknown>;
};

export class WorkflowTaskPaymentBridge {
  constructor(
    private readonly dependencies: WorkflowTaskPaymentBridgeDependencies = {
      paymentRepository,
      financeLedgerService,
      workflowRepository,
      workflowSubjectStateService,
    },
  ) {}

  async complete(input: PaymentWorkflowTaskBridgeInput) {
    if (input.action.trim() !== "complete") {
      return null;
    }

    const snapshot = input.task.instance.current_node_snapshot;
    if (!isRecord(snapshot) || snapshot.business_kind !== "payment_collection") {
      return null;
    }

    const existing = await this.dependencies.paymentRepository
      .findByWorkflowTaskId(input.task.id);
    const payment = existing ?? await this.createManualPayment(input, snapshot);

    await this.dependencies.financeLedgerService.createProjectPaymentLedger(
      this.buildLedgerInput(input, payment),
    );

    const result = await this.dependencies.workflowRepository.completeRuntimeNode({
      tenantId: input.task.tenant_id,
      definitionId: input.task.definition_id,
      instanceId: input.task.instance_id,
      nodeKey: input.task.node_key,
      action: input.action.trim(),
      output: input.output as JsonObject,
      actorEmployeeId: input.authContext.employeeId,
    });
    this.throwRuntimeCompleteError(result);

    const workflowState = await this.dependencies.workflowSubjectStateService
      .syncFromRuntimeInstance({
        tenantId: input.task.tenant_id,
        subjectType: "project",
        subjectId: input.task.instance.subject_id,
        definitionId: input.task.definition_id,
        instanceId: input.task.instance_id,
      });

    return {
      result: { ok: true, bridged: true, operation: "confirm_payment" },
      payment,
      workflow_state: workflowState,
    };
  }

  private buildLedgerInput(
    input: PaymentWorkflowTaskBridgeInput,
    payment: PaymentRecord,
  ) {
    return {
      tenant_id: input.task.tenant_id,
      project_id: input.task.instance.subject_id,
      direction: "in" as const,
      entry_type: "project_payment" as const,
      amount: Number(payment.amount),
      occurred_at: payment.pay_date ?? new Date().toISOString(),
      source_type: "workflow_task",
      source_id: input.task.id,
      workflow_task_id: input.task.id,
      payment_id: payment.id,
      handled_by: input.authContext.employeeId,
      summary: "项目收款入账",
      metadata: {
        payment_type: payment.type,
        payment_channel: payment.payment_channel ?? "manual",
        workflow_node_key: input.task.node_key,
      },
    };
  }

  private async createManualPayment(
    input: PaymentWorkflowTaskBridgeInput,
    snapshot: Record<string, unknown>,
  ) {
    const parsed = PaymentCollectionOutputSchema.safeParse(input.output);
    if (!parsed.success) {
      throw Errors.fromZod(parsed.error);
    }

    return this.dependencies.paymentRepository.create({
      project_id: input.task.instance.subject_id,
      amount: parsed.data.amount,
      type: getPaymentType(snapshot),
      status: "confirmed",
      evidence_images: parsed.data.evidence_images,
      handled_by: input.authContext.employeeId,
      pay_date: parsed.data.paid_at ?? new Date().toISOString(),
      workflow_task_id: input.task.id,
      source_type: "workflow_task",
      source_id: input.task.id,
      remark: parsed.data.remark ?? null,
      payment_channel: "manual",
    });
  }

  private throwRuntimeCompleteError(result: RuntimeCompleteResultForBridge) {
    if (result.ok) {
      return;
    }

    switch (result.reason) {
      case "instance_not_found":
        throw Errors.notFound("流程实例不存在");
      case "instance_not_running":
        throw Errors.badRequest("流程实例不在运行中");
      case "node_not_current":
        throw Errors.business(409, "节点不是当前待处理节点", "WORKFLOW_NODE_NOT_CURRENT", {
          current_node_key: result.currentNodeKey ?? null,
        });
      case "node_run_not_found":
        throw Errors.badRequest("当前节点运行记录不存在");
      case "graph_invalid":
        throw Errors.badRequest("流程发布版本图结构无效");
      case "invalid_output":
        throw Errors.badRequest("节点输出必须是对象");
      case "no_matching_edge":
        throw Errors.badRequest("当前节点没有匹配的分支条件");
    }
  }
}

function getPaymentType(snapshot: Record<string, unknown>): PaymentCollectionType {
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  const paymentType = config.payment_type;
  return typeof paymentType === "string" &&
    PAYMENT_COLLECTION_TYPES.includes(paymentType as PaymentCollectionType)
    ? paymentType as PaymentCollectionType
    : "deposit";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const workflowTaskPaymentBridge = new WorkflowTaskPaymentBridge();

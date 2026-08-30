import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from
  "@/repositories/supplier-command-errors";
import type { BatchCommandContext } from
  "@/repositories/supplier-purchase-batches";
import { SupplierPurchaseBatchRecordSchema } from
  "@/repositories/supplier-purchase-batch-records";
import {
  SupplierPurchaseBatchBlockerSchema,
  SupplierPurchaseBatchOrderSummarySchema,
  SupplierPurchaseBatchRevisionErrorCodeSchema,
} from "@/repositories/supplier-purchase-batch-command-records";
import { SupabaseDB } from "@/utils/supabase";

const WorkflowStateSchema = z.object({
  definition_id: z.uuid(),
  instance_id: z.uuid(),
  instance_status: z.literal("running"),
  current_node_key: z.string().trim().min(1),
  current_node_title: z.string().trim().min(1),
  current_business_kind: z.string().trim().min(1).nullable(),
  pending_task_count: z.number().int().positive(),
}).strict();

const WorkflowSubmitResultSchema = z.object({
  status: z.literal("submitted"),
  idempotent: z.boolean(),
  batch: SupplierPurchaseBatchRecordSchema,
  version: z.number().int().positive(),
  requisition_ids: z.array(z.uuid()).min(1).max(20),
  workflow_state: WorkflowStateSchema,
}).strict().superRefine((result, context) => {
  const uniqueRequisitionIds = new Set(
    result.requisition_ids.map((id) => id.toLowerCase()),
  );
  if (
    result.batch.status !== "pending_approval" ||
    result.batch.version !== result.version ||
    result.batch.approval_round === undefined ||
    result.batch.approval_round < 1 ||
    result.requisition_ids.length !== result.batch.supplier_count ||
    uniqueRequisitionIds.size !== result.requisition_ids.length
  ) {
    context.addIssue({
      code: "custom",
      message: "采购批次审批提交结果不一致",
    });
  }
});

const WorkflowReviewStateSchema = z.object({
  definition_id: z.uuid(),
  instance_id: z.uuid(),
  instance_status: z.enum(["running", "completed", "canceled"]),
  current_node_key: z.string().trim().min(1).nullable(),
  current_node_title: z.string().trim().min(1).nullable(),
  current_business_kind: z.string().trim().min(1).nullable(),
  pending_task_count: z.number().int().nonnegative(),
}).strict();

const WorkflowReviewResultSchema = z.object({
  status: z.enum([
    "pending_approval",
    "ordered",
    "rejected",
    "revision_required",
  ]),
  idempotent: z.boolean(),
  batch: SupplierPurchaseBatchRecordSchema,
  version: z.number().int().positive(),
  workflow_state: WorkflowReviewStateSchema,
  requisition_ids: z.array(z.uuid()).min(1).max(20).optional(),
  orders: z.array(SupplierPurchaseBatchOrderSummarySchema).min(1).max(20)
    .optional(),
  error_code: SupplierPurchaseBatchRevisionErrorCodeSchema.optional(),
  details: z.array(SupplierPurchaseBatchBlockerSchema).min(1).max(540)
    .optional(),
}).strict().superRefine((result, context) => {
  const expectedBatchStatus = result.status === "revision_required"
    ? "draft"
    : result.status;
  const ordered = result.status === "ordered";
  const revision = result.status === "revision_required";
  if (
    result.batch.status !== expectedBatchStatus ||
    result.batch.version !== result.version ||
    ordered !== Boolean(result.requisition_ids && result.orders) ||
    (ordered && (
      result.requisition_ids?.length !== result.batch.supplier_count ||
      result.orders?.length !== result.batch.supplier_count
    )) ||
    revision !== Boolean(result.error_code && result.details)
  ) {
    context.addIssue({
      code: "custom",
      message: "采购批次审批结果不一致",
    });
  }
});

const WorkflowWithdrawResultSchema = z.object({
  status: z.literal("withdrawn"),
  idempotent: z.boolean(),
  batch: SupplierPurchaseBatchRecordSchema,
  version: z.number().int().positive(),
  workflow_state: WorkflowReviewStateSchema,
}).strict().superRefine((result, context) => {
  if (result.batch.status !== "draft" ||
    result.batch.version !== result.version ||
    result.workflow_state.instance_status !== "canceled" ||
    result.workflow_state.pending_task_count !== 0) {
    context.addIssue({
      code: "custom",
      message: "采购批次撤回结果不一致",
    });
  }
});

export type SupplierPurchaseBatchWorkflowSubmitResult = z.infer<
  typeof WorkflowSubmitResultSchema
>;
export type SupplierPurchaseBatchWorkflowReviewResult = z.infer<
  typeof WorkflowReviewResultSchema
>;
export type SupplierPurchaseBatchWorkflowWithdrawResult = z.infer<
  typeof WorkflowWithdrawResultSchema
>;

export type SupplierPurchaseBatchWorkflowReviewInput = {
  tenantId: string;
  batchId: string;
  taskId: string;
  action: "approve" | "reject";
  reason: string | null;
  output: Record<string, unknown>;
  actorUserId: string;
  actorEmployeeId: string;
  idempotencyKey: string;
};

export type SupplierPurchaseBatchWorkflowWithdrawInput = {
  tenantId: string;
  batchId: string;
  expectedVersion: number;
  reason: string | null;
  actorUserId: string;
  actorEmployeeId: string;
  idempotencyKey: string;
};

type Client = {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
};

export class SupplierPurchaseBatchWorkflowRepository {
  constructor(
    private readonly clientProvider: () => Client = () =>
      SupabaseDB.getAdminClient() as unknown as Client,
  ) {}

  async submit(
    input: BatchCommandContext,
  ): Promise<SupplierPurchaseBatchWorkflowSubmitResult> {
    const { data, error } = await this.clientProvider().rpc(
      "submit_supplier_purchase_batch_with_workflow",
      {
        p_batch_id: input.batch_id,
        p_tenant_id: input.tenant_id,
        p_expected_version: input.expected_version,
        p_actor_user_id: input.actor_user_id,
        p_actor_employee_id: input.actor_employee_id,
        p_idempotency_key: input.idempotency_key,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(
        error,
        "提交供应商采购批次并启动审批失败",
      );
    }
    const parsed = WorkflowSubmitResultSchema.safeParse(data);
    if (!parsed.success ||
      parsed.data.batch.id !== input.batch_id ||
      parsed.data.batch.tenant_id !== input.tenant_id) {
      throw Errors.dbError(
        "提交供应商采购批次并启动审批失败",
        parsed.success ? data : parsed.error.issues,
      );
    }
    return parsed.data;
  }

  async completeTask(
    input: SupplierPurchaseBatchWorkflowReviewInput,
  ): Promise<SupplierPurchaseBatchWorkflowReviewResult> {
    const { data, error } = await this.clientProvider().rpc(
      "complete_supplier_purchase_batch_workflow_task",
      {
        p_tenant_id: input.tenantId,
        p_batch_id: input.batchId,
        p_task_id: input.taskId,
        p_action: input.action,
        p_reason: input.reason,
        p_output: input.output,
        p_actor_user_id: input.actorUserId,
        p_actor_employee_id: input.actorEmployeeId,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(
        error,
        "处理供应商采购批次审批任务失败",
      );
    }
    const parsed = WorkflowReviewResultSchema.safeParse(data);
    if (!parsed.success || parsed.data.batch.id !== input.batchId ||
      parsed.data.batch.tenant_id !== input.tenantId) {
      throw Errors.dbError(
        "处理供应商采购批次审批任务失败",
        parsed.success ? data : parsed.error.issues,
      );
    }
    if (parsed.data.status === "revision_required") {
      throw Errors.business(
        409,
        "采购批次数据已变化，请刷新并修订后重新提交",
        parsed.data.error_code!,
        {
          batch: parsed.data.batch,
          version: parsed.data.version,
          error_code: parsed.data.error_code,
          details: parsed.data.details,
        },
      );
    }
    return parsed.data;
  }

  async withdraw(
    input: SupplierPurchaseBatchWorkflowWithdrawInput,
  ): Promise<SupplierPurchaseBatchWorkflowWithdrawResult> {
    const { data, error } = await this.clientProvider().rpc(
      "withdraw_supplier_purchase_batch_workflow",
      {
        p_tenant_id: input.tenantId,
        p_batch_id: input.batchId,
        p_expected_version: input.expectedVersion,
        p_reason: input.reason,
        p_actor_user_id: input.actorUserId,
        p_actor_employee_id: input.actorEmployeeId,
        p_idempotency_key: input.idempotencyKey,
      },
    );
    if (error) {
      throwSupplierCommandDatabaseError(
        error,
        "撤回供应商采购批次审批失败",
      );
    }
    const parsed = WorkflowWithdrawResultSchema.safeParse(data);
    if (!parsed.success || parsed.data.batch.id !== input.batchId ||
      parsed.data.batch.tenant_id !== input.tenantId) {
      throw Errors.dbError(
        "撤回供应商采购批次审批失败",
        parsed.success ? data : parsed.error.issues,
      );
    }
    return parsed.data;
  }
}

export const supplierPurchaseBatchWorkflowRepository =
  new SupplierPurchaseBatchWorkflowRepository();

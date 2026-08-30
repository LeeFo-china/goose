import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { throwSupplierCommandDatabaseError } from
  "@/repositories/supplier-command-errors";
import type { BatchCommandContext } from
  "@/repositories/supplier-purchase-batches";
import { SupplierPurchaseBatchRecordSchema } from
  "@/repositories/supplier-purchase-batch-records";
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

export type SupplierPurchaseBatchWorkflowSubmitResult = z.infer<
  typeof WorkflowSubmitResultSchema
>;

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
}

export const supplierPurchaseBatchWorkflowRepository =
  new SupplierPurchaseBatchWorkflowRepository();

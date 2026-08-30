import { z } from "zod";

import { Errors } from "@/errors/error-factory";
import { SupabaseDB } from "@/utils/supabase";
import {
  WORKFLOW_INSTANCE_STATUS_VALUES,
  WORKFLOW_TASK_STATUS_VALUES,
} from "@gooes/domain";

const RunningInstanceSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  subject_type: z.literal("supplier_purchase_batch"),
  subject_id: z.uuid(),
  status: z.enum(WORKFLOW_INSTANCE_STATUS_VALUES),
  current_node_key: z.string().trim().min(1).nullable(),
  context: z.record(z.string(), z.unknown()),
}).strict();

const ReviewTaskSchema = z.object({
  id: z.uuid(),
  tenant_id: z.uuid(),
  instance_id: z.uuid(),
  node_key: z.string().trim().min(1),
  status: z.enum(WORKFLOW_TASK_STATUS_VALUES),
  assignee_employee_id: z.uuid().nullable(),
  assignee_role_code: z.string().trim().min(1).nullable(),
  assignee_permission_code: z.string().trim().min(1).nullable(),
}).strict();

export type SupplierPurchaseBatchRunningWorkflowInstance = z.infer<
  typeof RunningInstanceSchema
>;
export type SupplierPurchaseBatchPendingWorkflowTask = z.infer<
  typeof ReviewTaskSchema
>;
export type SupplierPurchaseBatchWorkflowReviewEvent = z.infer<
  typeof ReviewEventSchema
>;

const ReviewEventSchema = z.object({
  id: z.uuid(),
  idempotency_key: z.string().trim().min(1).max(120),
  request: z.record(z.string(), z.unknown()),
}).strict();

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
type Query = {
  select(columns: string): Query;
  eq(column: string, value: string): Query;
  order(column: string, options: { ascending: boolean }): Query;
  limit(value: number): QueryResult;
};
type Client = { from(table: string): Query };

const RUNNING_INSTANCE_SELECT = [
  "id",
  "tenant_id",
  "subject_type",
  "subject_id",
  "status",
  "current_node_key",
  "context",
].join(",");
const PENDING_TASK_SELECT = [
  "id",
  "tenant_id",
  "instance_id",
  "node_key",
  "status",
  "assignee_employee_id",
  "assignee_role_code",
  "assignee_permission_code",
].join(",");

export class SupplierPurchaseBatchWorkflowReviewLookupRepository {
  constructor(private readonly clientProvider: () => Client = () =>
    SupabaseDB.getAdminClient() as unknown as Client) {}

  async listRunningInstances(input: {
    tenantId: string;
    batchId: string;
  }): Promise<SupplierPurchaseBatchRunningWorkflowInstance[]> {
    const { data, error } = await this.clientProvider()
      .from("workflow_instances")
      .select(RUNNING_INSTANCE_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("subject_type", "supplier_purchase_batch")
      .eq("subject_id", input.batchId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(2);
    if (error) throw Errors.dbError("查询采购批次审批流程失败", error);
    return parseRows(RunningInstanceSchema, data, "查询采购批次审批流程失败");
  }

  async listPendingTasks(input: {
    tenantId: string;
    instanceId: string;
  }): Promise<SupplierPurchaseBatchPendingWorkflowTask[]> {
    const { data, error } = await this.clientProvider()
      .from("workflow_tasks")
      .select(PENDING_TASK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("instance_id", input.instanceId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(2);
    if (error) throw Errors.dbError("查询采购批次审批待办失败", error);
    return parseRows(ReviewTaskSchema, data, "查询采购批次审批待办失败");
  }

  async listReviewEvents(input: {
    tenantId: string;
    batchId: string;
    idempotencyKey?: string;
  }): Promise<SupplierPurchaseBatchWorkflowReviewEvent[]> {
    let query = this.clientProvider()
      .from("supplier_purchase_batch_command_events")
      .select("id,idempotency_key,request")
      .eq("tenant_id", input.tenantId)
      .eq("purchase_batch_id", input.batchId)
      .eq("command_type", "review");
    if (input.idempotencyKey) {
      query = query.eq("idempotency_key", input.idempotencyKey);
    }
    const { data, error } = await query
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(2);
    if (error) throw Errors.dbError("查询采购批次审批事件失败", error);
    return parseRows(ReviewEventSchema, data, "查询采购批次审批事件失败");
  }

  async listTasksById(input: {
    tenantId: string;
    taskId: string;
  }): Promise<SupplierPurchaseBatchPendingWorkflowTask[]> {
    const { data, error } = await this.clientProvider()
      .from("workflow_tasks")
      .select(PENDING_TASK_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.taskId)
      .order("id", { ascending: true })
      .limit(2);
    if (error) throw Errors.dbError("查询采购批次审批待办失败", error);
    return parseRows(ReviewTaskSchema, data, "查询采购批次审批待办失败");
  }

  async listInstancesById(input: {
    tenantId: string;
    instanceId: string;
  }): Promise<SupplierPurchaseBatchRunningWorkflowInstance[]> {
    const { data, error } = await this.clientProvider()
      .from("workflow_instances")
      .select(RUNNING_INSTANCE_SELECT)
      .eq("tenant_id", input.tenantId)
      .eq("id", input.instanceId)
      .order("id", { ascending: true })
      .limit(2);
    if (error) throw Errors.dbError("查询采购批次审批流程失败", error);
    return parseRows(RunningInstanceSchema, data, "查询采购批次审批流程失败");
  }
}

function parseRows<Schema extends z.ZodType>(
  schema: Schema,
  data: unknown,
  message: string,
): z.infer<Schema>[] {
  const parsed = z.array(schema).max(2).safeParse(data ?? []);
  if (!parsed.success) throw Errors.dbError(message, parsed.error.issues);
  return parsed.data;
}

export const supplierPurchaseBatchWorkflowReviewLookupRepository =
  new SupplierPurchaseBatchWorkflowReviewLookupRepository();

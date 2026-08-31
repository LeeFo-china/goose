import { Errors } from "@/errors/error-factory";

import type {
  SupplierPurchaseBatchWorkflowSmokeDependencies,
  SupplierPurchaseBatchWorkflowSmokeExecutionFacts,
  SupplierPurchaseBatchWorkflowSmokeGateway,
  SupplierPurchaseBatchWorkflowSmokePrerequisites,
  SupplierPurchaseBatchWorkflowSmokeTargets,
} from "./supplier-purchase-batch-workflow-smoke";
import { inspectSupplierPurchaseBatchWorkflow } from
  "./supplier-purchase-batch-workflow-smoke-workflow-preflight";

const PREREQUISITE_ERROR =
  "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREREQUISITE";
const EVIDENCE_ERROR =
  "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_EVIDENCE_INVALID";

type AccessRow = {
  applicant_user_id: string | null;
  purchase_user_id: string | null;
  finance_user_id: string | null;
  applicant_ready: boolean;
  purchase_ready: boolean;
  finance_ready: boolean;
};

type RolloutRow = {
  module_enabled: boolean;
  ownership_reads_enabled: boolean;
  private_supplier_writes_enabled: boolean;
  private_catalog_writes_enabled: boolean;
  procurement_snapshot_v1_enabled: boolean;
  purchase_batch_workflow_enabled: boolean;
};

class PostgresSupplierPurchaseBatchWorkflowSmokeGateway
  implements SupplierPurchaseBatchWorkflowSmokeGateway {
  constructor(private readonly database: Bun.SQL) {}

  async inspect(input: SupplierPurchaseBatchWorkflowSmokeTargets) {
    const [accessRows, rolloutRows, workflowRows, catalogRows, costRows] =
      await Promise.all([
        this.inspectAccess(input),
        this.inspectRollout(input),
        inspectSupplierPurchaseBatchWorkflow(this.database, input),
        this.database<Array<{ result: unknown }>>`
          SELECT public.resolve_supplier_purchase_batch_catalog(
            p_tenant_id => ${input.tenantId}::uuid,
            p_project_id => ${input.projectId}::uuid,
            p_page => 1,
            p_page_size => 20
          ) AS result;
        `,
        this.database<Array<{ id: string }>>`
          SELECT category.id
          FROM public.finance_cost_categories AS category
          JOIN public.project_cost_budgets AS budget
            ON budget.tenant_id = category.tenant_id
           AND budget.cost_category_id = category.id
           AND budget.project_id = ${input.projectId}::uuid
          WHERE category.tenant_id = ${input.tenantId}::uuid
            AND category.status = 'active'
          ORDER BY category.sort_order, category.id
          LIMIT 100;
        `,
      ]);
    const access = accessRows[0];
    const rollout = rolloutRows[0];
    const workflow = workflowRows[0];
    const catalog = asRecord(catalogRows[0]?.result);
    const catalogItems = Array.isArray(catalog?.items) ? catalog.items : [];
    const firstCatalogItem = asRecord(catalogItems[0]);
    if (!access?.applicant_user_id || !access.purchase_user_id ||
      !access.finance_user_id || !access.applicant_ready ||
      !access.purchase_ready || !access.finance_ready ||
      !rolloutReady(rollout) || !workflow?.all_candidates_ready ||
      !workflow.purchase_node_ready || !workflow.finance_node_ready ||
      input.applicantEmployeeId === input.purchaseApproverId ||
      input.applicantEmployeeId === input.financeApproverId ||
      typeof firstCatalogItem?.supplier_sku_id !== "string" ||
      !costRows[0]?.id) {
      throw Errors.business(
        409,
        "采购批次审批 smoke 前置条件不完整",
        PREREQUISITE_ERROR,
      );
    }
    return {
      applicantUserId: access.applicant_user_id,
      purchaseApproverUserId: access.purchase_user_id,
      financeApproverUserId: access.finance_user_id,
      supplierSkuId: firstCatalogItem.supplier_sku_id,
      costCategoryId: costRows[0].id,
      purchaseApproverReady: true as const,
      financeApproverReady: true as const,
    };
  }

  private inspectAccess(input: SupplierPurchaseBatchWorkflowSmokeTargets) {
    return this.database<Array<AccessRow>>`
      SELECT applicant.user_id::text AS applicant_user_id,
        purchase_approver.user_id::text AS purchase_user_id,
        finance_approver.user_id::text AS finance_user_id,
        public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.applicantEmployeeId}::uuid,
          ${input.projectId}::uuid, 'supplier.purchase-requisition.manage'
        ) AND public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.applicantEmployeeId}::uuid,
          ${input.projectId}::uuid, 'project.update'
        ) AS applicant_ready,
        public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.purchaseApproverId}::uuid,
          ${input.projectId}::uuid, 'supplier.purchase-requisition.approve'
        ) AND public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.purchaseApproverId}::uuid,
          ${input.projectId}::uuid, 'supplier.purchase-requisition.view'
        ) AND public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.purchaseApproverId}::uuid,
          ${input.projectId}::uuid, 'project.read'
        ) AS purchase_ready,
        public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.financeApproverId}::uuid,
          ${input.projectId}::uuid, 'finance.budget.manage'
        ) AND public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.financeApproverId}::uuid,
          ${input.projectId}::uuid, 'supplier.purchase-requisition.view'
        ) AND public.__gooes_employee_has_project_permission_scope(
          ${input.tenantId}::uuid, ${input.financeApproverId}::uuid,
          ${input.projectId}::uuid, 'project.read'
        ) AS finance_ready
      FROM public.employees AS applicant
      JOIN public.employees AS purchase_approver
        ON purchase_approver.id = ${input.purchaseApproverId}::uuid
       AND purchase_approver.tenant_id = ${input.tenantId}::uuid
       AND purchase_approver.status = 'active'
       AND purchase_approver.user_id IS NOT NULL
      JOIN public.employees AS finance_approver
        ON finance_approver.id = ${input.financeApproverId}::uuid
       AND finance_approver.tenant_id = ${input.tenantId}::uuid
       AND finance_approver.status = 'active'
       AND finance_approver.user_id IS NOT NULL
      WHERE applicant.id = ${input.applicantEmployeeId}::uuid
        AND applicant.tenant_id = ${input.tenantId}::uuid
        AND applicant.status = 'active'
        AND applicant.user_id IS NOT NULL
      LIMIT 100;
    `;
  }

  private inspectRollout(input: SupplierPurchaseBatchWorkflowSmokeTargets) {
    return this.database<Array<RolloutRow>>`
      SELECT setting.module_enabled, setting.ownership_reads_enabled,
        setting.private_supplier_writes_enabled,
        setting.private_catalog_writes_enabled,
        setting.procurement_snapshot_v1_enabled,
        setting.purchase_batch_workflow_enabled
      FROM public.tenant_supplier_settings AS setting
      WHERE setting.tenant_id = ${input.tenantId}::uuid
      LIMIT 100;
    `;
  }

  async execute(input: {
    targets: SupplierPurchaseBatchWorkflowSmokeTargets;
    prerequisites: SupplierPurchaseBatchWorkflowSmokePrerequisites;
    requestId: string;
    fixturePrefix: string;
  }): Promise<SupplierPurchaseBatchWorkflowSmokeExecutionFacts> {
    const batchId = crypto.randomUUID();
    const idempotencyPrefix = `${input.fixturePrefix}:${input.requestId}`;
    const saved = await this.database<Array<{ result: unknown }>>`
      SELECT public.save_supplier_purchase_batch_draft(
        ${batchId}::uuid, ${input.targets.tenantId}::uuid,
        ${input.targets.projectId}::uuid, 0,
        ${`${input.fixturePrefix} 发布验收`}::text, NULL::date,
        ${`requestId=${input.requestId}`}::text,
        ${[{ supplier_sku_id: input.prerequisites.supplierSkuId,
          cost_category_id: input.prerequisites.costCategoryId,
          quantity: "1" }]}::jsonb,
        ${input.prerequisites.applicantUserId}::uuid,
        ${input.targets.applicantEmployeeId}::uuid,
        ${`${idempotencyPrefix}:save`}::text
      ) AS result;
    `;
    assertResultStatus(saved[0]?.result, "saved");
    const submitted = await this.database<Array<{ result: unknown }>>`
      SELECT public.submit_supplier_purchase_batch_with_workflow(
        ${batchId}::uuid, ${input.targets.tenantId}::uuid, 1,
        ${input.prerequisites.applicantUserId}::uuid,
        ${input.targets.applicantEmployeeId}::uuid,
        ${`${idempotencyPrefix}:submit`}::text
      ) AS result;
    `;
    assertResultStatus(submitted[0]?.result, "submitted");

    const batchRows = await this.database<Array<{ budget_status: string }>>`
      SELECT batch.budget_status
      FROM public.supplier_purchase_batches AS batch
      WHERE batch.tenant_id = ${input.targets.tenantId}::uuid
        AND batch.id = ${batchId}::uuid
      LIMIT 100;
    `;
    const budgetStatus = batchRows[0]?.budget_status;
    if (budgetStatus !== "within_budget" && budgetStatus !== "over_budget") {
      throw Errors.business(500, "采购批次审批 smoke 证据状态异常", EVIDENCE_ERROR);
    }
    const purchaseTaskId = await findPendingTaskId(
      this.database,
      input.targets.tenantId,
      batchId,
      "purchase_review",
    );
    const purchaseResult = await this.database<Array<{ result: unknown }>>`
      SELECT public.complete_supplier_purchase_batch_workflow_task(
        ${input.targets.tenantId}::uuid, ${batchId}::uuid,
        ${purchaseTaskId}::uuid, 'approve', NULL::text, '{}'::jsonb,
        ${input.prerequisites.purchaseApproverUserId}::uuid,
        ${input.targets.purchaseApproverId}::uuid,
        ${`${idempotencyPrefix}:purchase-approve`}::text
      ) AS result;
    `;
    assertResultStatus(
      purchaseResult[0]?.result,
      budgetStatus === "over_budget" ? "pending_approval" : "ordered",
    );
    if (budgetStatus === "over_budget") {
      const financeTaskId = await findPendingTaskId(
        this.database,
        input.targets.tenantId,
        batchId,
        "finance_review",
      );
      const financeResult = await this.database<Array<{ result: unknown }>>`
        SELECT public.complete_supplier_purchase_batch_workflow_task(
          ${input.targets.tenantId}::uuid, ${batchId}::uuid,
          ${financeTaskId}::uuid, 'approve', NULL::text, '{}'::jsonb,
          ${input.prerequisites.financeApproverUserId}::uuid,
          ${input.targets.financeApproverId}::uuid,
          ${`${idempotencyPrefix}:finance-approve`}::text
        ) AS result;
      `;
      assertResultStatus(financeResult[0]?.result, "ordered");
    }
    return this.collectEvidence(input.targets.tenantId, batchId);
  }

  private async collectEvidence(
    tenantId: string,
    batchId: string,
  ): Promise<SupplierPurchaseBatchWorkflowSmokeExecutionFacts> {
    const [batchRows, instanceRows, taskRows, orderRows] = await Promise.all([
      this.database<Array<{
        approval_round: number;
        budget_status: "within_budget" | "over_budget";
        status: string;
        supplier_count: number;
      }>>`
        SELECT batch.approval_round, batch.budget_status, batch.status,
          batch.supplier_count
        FROM public.supplier_purchase_batches AS batch
        WHERE batch.tenant_id = ${tenantId}::uuid
          AND batch.id = ${batchId}::uuid
        LIMIT 100;
      `,
      this.database<Array<{ id: string }>>`
        SELECT instance.id
        FROM public.workflow_instances AS instance
        WHERE instance.tenant_id = ${tenantId}::uuid
          AND instance.subject_type = 'supplier_purchase_batch'
          AND instance.subject_id = ${batchId}::text
        ORDER BY instance.created_at DESC, instance.id DESC
        LIMIT 100;
      `,
      this.database<Array<{ id: string }>>`
        SELECT task.id
        FROM public.workflow_tasks AS task
        JOIN public.workflow_instances AS instance
          ON instance.id = task.instance_id
        WHERE task.tenant_id = ${tenantId}::uuid
          AND instance.subject_id = ${batchId}::text
        ORDER BY task.created_at, task.id
        LIMIT 100;
      `,
      this.database<Array<{
        id: string;
        supplier_id: string;
        status: string;
        total_count: number;
      }>>`
        SELECT purchase_order.id, purchase_order.supplier_id,
          purchase_order.status, COUNT(*) OVER()::integer AS total_count
        FROM public.supplier_purchase_orders AS purchase_order
        WHERE purchase_order.tenant_id = ${tenantId}::uuid
          AND purchase_order.purchase_batch_id = ${batchId}::uuid
        ORDER BY purchase_order.id
        LIMIT 100;
      `,
    ]);
    const batch = batchRows[0];
    const instance = instanceRows[0];
    const supplierCount = new Set(orderRows.map(({ supplier_id }) => supplier_id))
      .size;
    if (!batch || !instance || batch.status !== "ordered" ||
      (batch.budget_status !== "within_budget" &&
        batch.budget_status !== "over_budget") || orderRows.length === 0 ||
      orderRows.some((purchase_order) =>
        purchase_order.status !== "submitted"
      ) || orderRows[0]?.total_count !== orderRows.length ||
      supplierCount !== orderRows.length ||
      batch.supplier_count !== supplierCount) {
      throw Errors.business(500, "采购批次审批 smoke 证据状态异常", EVIDENCE_ERROR);
    }
    return {
      batchId,
      approvalRound: batch.approval_round,
      instanceId: instance.id,
      taskIds: taskRows.map(({ id }) => id),
      budgetState: batch.budget_status,
      orderIds: orderRows.map(({ id }) => id),
      supplierCount,
    };
  }

  close(): Promise<void> {
    return this.database.close();
  }
}

async function findPendingTaskId(
  sql: Bun.SQL,
  tenantId: string,
  batchId: string,
  nodeKey: "purchase_review" | "finance_review",
): Promise<string> {
  const rows = await sql<Array<{ id: string }>>`
    SELECT task.id
    FROM public.workflow_tasks AS task
    JOIN public.workflow_instances AS instance ON instance.id = task.instance_id
    WHERE task.tenant_id = ${tenantId}::uuid
      AND instance.tenant_id = ${tenantId}::uuid
      AND instance.subject_type = 'supplier_purchase_batch'
      AND instance.subject_id = ${batchId}::text
      AND instance.status = 'running'
      AND task.node_key = ${nodeKey}::text
      AND task.status = 'pending'
    ORDER BY task.created_at, task.id
    LIMIT 100;
  `;
  if (rows.length !== 1 || !rows[0]?.id) {
    throw Errors.business(
      409,
      "采购批次审批 smoke 待办状态异常",
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_TASK_INVALID",
    );
  }
  return rows[0].id;
}

function rolloutReady(row: RolloutRow | undefined): boolean {
  return !!row?.module_enabled && !!row.ownership_reads_enabled &&
    !!row.private_supplier_writes_enabled &&
    !!row.private_catalog_writes_enabled &&
    !!row.procurement_snapshot_v1_enabled &&
    !!row.purchase_batch_workflow_enabled;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function assertResultStatus(value: unknown, expected: string): void {
  const result = asRecord(value);
  if (result?.status !== expected) {
    throw Errors.business(
      500,
      "采购批次审批 smoke 命令结果异常",
      "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_COMMAND_FAILED",
    );
  }
}

export function defaultSupplierPurchaseBatchWorkflowSmokeDependencies():
  SupplierPurchaseBatchWorkflowSmokeDependencies {
  return {
    createGateway: () => {
      const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
        process.env.SUPABASE_DB_URL;
      if (!databaseUrl) {
        throw Errors.business(
          500,
          "采购批次审批 smoke 缺少数据库配置",
          "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_DATABASE_REQUIRED",
        );
      }
      return new PostgresSupplierPurchaseBatchWorkflowSmokeGateway(
        new Bun.SQL(databaseUrl, {
          max: 2,
          prepare: false,
          connectionTimeout: 10,
        }),
      );
    },
    requestId: () => crypto.randomUUID(),
  };
}

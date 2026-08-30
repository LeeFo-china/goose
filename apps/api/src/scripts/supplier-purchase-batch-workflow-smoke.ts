import { Errors } from "@/errors/error-factory";

export const SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREFIX = "SPBW-SMOKE";

const ARGUMENT_ERROR =
  "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_ARGUMENT_INVALID";
const FAILED_ERROR = "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_FAILED";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type SupplierPurchaseBatchWorkflowSmokeTargets = {
  tenantId: string;
  projectId: string;
  applicantEmployeeId: string;
  purchaseApproverId: string;
  financeApproverId: string;
};

export type SupplierPurchaseBatchWorkflowSmokeOptions =
  SupplierPurchaseBatchWorkflowSmokeTargets & { execute: boolean };

export type SupplierPurchaseBatchWorkflowSmokePrerequisites = {
  applicantUserId: string;
  purchaseApproverUserId: string;
  financeApproverUserId: string;
  supplierSkuId: string;
  costCategoryId: string;
  purchaseApproverReady: true;
  financeApproverReady: true;
};

type ExecutionFacts = {
  batchId: string;
  approvalRound: number;
  instanceId: string;
  taskIds: string[];
  budgetState: "within_budget" | "over_budget";
  orderIds: string[];
  supplierCount: number;
};

export type SupplierPurchaseBatchWorkflowSmokeGateway = {
  inspect(
    input: SupplierPurchaseBatchWorkflowSmokeTargets,
  ): Promise<SupplierPurchaseBatchWorkflowSmokePrerequisites>;
  execute(input: {
    targets: SupplierPurchaseBatchWorkflowSmokeTargets;
    prerequisites: SupplierPurchaseBatchWorkflowSmokePrerequisites;
    requestId: string;
    fixturePrefix: typeof SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREFIX;
  }): Promise<ExecutionFacts>;
  close(): Promise<void>;
};

type SmokeDependencies = {
  createGateway: () => SupplierPurchaseBatchWorkflowSmokeGateway;
  requestId: () => string;
};

const ARGUMENTS = {
  "--tenant-id": "tenantId",
  "--project-id": "projectId",
  "--applicant-employee-id": "applicantEmployeeId",
  "--purchase-approver-id": "purchaseApproverId",
  "--finance-approver-id": "financeApproverId",
} as const;

export function parseSupplierPurchaseBatchWorkflowSmokeArgs(
  args: string[],
): SupplierPurchaseBatchWorkflowSmokeOptions {
  const values: Partial<SupplierPurchaseBatchWorkflowSmokeTargets> = {};
  let execute = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--execute") {
      if (execute) throw Errors.business(400, "采购批次审批 smoke 参数无效", ARGUMENT_ERROR);
      execute = true;
      continue;
    }
    const field = argument
      ? ARGUMENTS[argument as keyof typeof ARGUMENTS]
      : undefined;
    const value = args[index + 1];
    if (!field || !value || values[field] !== undefined ||
      !UUID_PATTERN.test(value)) {
      throw Errors.business(400, "采购批次审批 smoke 参数无效", ARGUMENT_ERROR);
    }
    values[field] = value;
    index += 1;
  }
  if (Object.keys(values).length !== Object.keys(ARGUMENTS).length) {
    throw Errors.business(400, "采购批次审批 smoke 参数无效", ARGUMENT_ERROR);
  }
  return {
    tenantId: values.tenantId!,
    projectId: values.projectId!,
    applicantEmployeeId: values.applicantEmployeeId!,
    purchaseApproverId: values.purchaseApproverId!,
    financeApproverId: values.financeApproverId!,
    execute,
  };
}

export async function runSupplierPurchaseBatchWorkflowSmoke(
  options: SupplierPurchaseBatchWorkflowSmokeOptions,
  dependencies: SmokeDependencies = defaultDependencies(),
) {
  const gateway = dependencies.createGateway();
  const requestId = dependencies.requestId();
  const targets = smokeTargets(options);
  try {
    const prerequisites = await gateway.inspect(targets);
    if (!options.execute) {
      return {
        ok: true as const,
        mode: "dry-run" as const,
        requestId,
        fixturePrefix: SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREFIX,
        batchId: null,
        approvalRound: null,
        instanceId: null,
        taskIds: [],
        budgetState: "preflight_ready" as const,
        orderIds: [],
        supplierCount: 0,
        cleanupRecommendation: "dry-run 未写入，无需清理",
      };
    }
    const facts = await gateway.execute({
      targets,
      prerequisites,
      requestId,
      fixturePrefix: SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREFIX,
    });
    return {
      ok: true as const,
      mode: "execute" as const,
      requestId,
      fixturePrefix: SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREFIX,
      ...facts,
      cleanupRecommendation:
        `证据默认保留且不自动删除；清理前按 runbook 核对批次 ${facts.batchId}`,
    };
  } finally {
    await gateway.close();
  }
}

export function formatSupplierPurchaseBatchWorkflowSmokeFailure(
  _error: unknown,
  requestId: string,
) {
  return { ok: false as const, code: FAILED_ERROR, requestId };
}

class PostgresSupplierPurchaseBatchWorkflowSmokeGateway
  implements SupplierPurchaseBatchWorkflowSmokeGateway {
  constructor(private readonly database: Bun.SQL) {}

  async inspect(input: SupplierPurchaseBatchWorkflowSmokeTargets) {
    const [accessRows, catalogRows, costRows] = await Promise.all([
      this.database<Array<{
        applicant_user_id: string | null;
        purchase_user_id: string | null;
        finance_user_id: string | null;
        applicant_ready: boolean;
        purchase_ready: boolean;
        finance_ready: boolean;
      }>>`
        SELECT applicant.user_id::text AS applicant_user_id,
          purchase_approver.user_id::text AS purchase_user_id,
          finance_approver.user_id::text AS finance_user_id,
          public.__gooes_employee_has_project_permission_scope(
            ${input.tenantId}::uuid, ${input.applicantEmployeeId}::uuid,
            ${input.projectId}::uuid,
            'supplier.purchase-requisition.manage'
          ) AND public.__gooes_employee_has_project_permission_scope(
            ${input.tenantId}::uuid, ${input.applicantEmployeeId}::uuid,
            ${input.projectId}::uuid, 'project.update'
          ) AS applicant_ready,
          public.__gooes_employee_has_project_permission_scope(
            ${input.tenantId}::uuid, ${input.purchaseApproverId}::uuid,
            ${input.projectId}::uuid,
            'supplier.purchase-requisition.approve'
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
      `,
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
    const catalog = asRecord(catalogRows[0]?.result);
    const catalogItems = Array.isArray(catalog?.items) ? catalog.items : [];
    const firstCatalogItem = asRecord(catalogItems[0]);
    if (!access?.applicant_user_id || !access.purchase_user_id ||
      !access.finance_user_id || !access.applicant_ready ||
      !access.purchase_ready || !access.finance_ready ||
      input.applicantEmployeeId === input.purchaseApproverId ||
      input.applicantEmployeeId === input.financeApproverId ||
      typeof firstCatalogItem?.supplier_sku_id !== "string" ||
      !costRows[0]?.id) {
      throw Errors.business(409, "采购批次审批 smoke 前置条件不完整", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREREQUISITE");
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

  async execute(input: {
    targets: SupplierPurchaseBatchWorkflowSmokeTargets;
    prerequisites: SupplierPurchaseBatchWorkflowSmokePrerequisites;
    requestId: string;
    fixturePrefix: typeof SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_PREFIX;
  }): Promise<ExecutionFacts> {
    const batchId = crypto.randomUUID();
    const idempotencyPrefix = `${input.fixturePrefix}:${input.requestId}`;
    await this.database.begin(async (sql) => {
      const saved = await sql<Array<{ result: unknown }>>`
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
      const submitted = await sql<Array<{ result: unknown }>>`
        SELECT public.submit_supplier_purchase_batch_with_workflow(
          ${batchId}::uuid, ${input.targets.tenantId}::uuid, 1,
          ${input.prerequisites.applicantUserId}::uuid,
          ${input.targets.applicantEmployeeId}::uuid,
          ${`${idempotencyPrefix}:submit`}::text
        ) AS result;
      `;
      assertResultStatus(submitted[0]?.result, "submitted");

      const batchRows = await sql<Array<{ budget_status: string }>>`
        SELECT batch.budget_status
        FROM public.supplier_purchase_batches AS batch
        WHERE batch.tenant_id = ${input.targets.tenantId}::uuid
          AND batch.id = ${batchId}::uuid
        LIMIT 100;
      `;
      const budgetStatus = batchRows[0]?.budget_status;
      if (budgetStatus !== "within_budget" && budgetStatus !== "over_budget") {
        throw Errors.business(500, "采购批次审批 smoke 证据状态异常", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_EVIDENCE_INVALID");
      }
      const purchaseTaskId = await findPendingTaskId(
        sql,
        input.targets.tenantId,
        batchId,
        "purchase_review",
      );
      const purchaseResult = await sql<Array<{ result: unknown }>>`
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
          sql,
          input.targets.tenantId,
          batchId,
          "finance_review",
        );
        const financeResult = await sql<Array<{ result: unknown }>>`
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
    });

    const [batchRows, instanceRows, taskRows, orderRows] = await Promise.all([
      this.database<Array<{
        approval_round: number;
        budget_status: string;
        status: string; supplier_count: number;
      }>>`
        SELECT batch.approval_round, batch.budget_status, batch.status, batch.supplier_count
        FROM public.supplier_purchase_batches AS batch
        WHERE batch.tenant_id = ${input.targets.tenantId}::uuid
          AND batch.id = ${batchId}::uuid
        LIMIT 100;
      `,
      this.database<Array<{ id: string }>>`
        SELECT instance.id
        FROM public.workflow_instances AS instance
        WHERE instance.tenant_id = ${input.targets.tenantId}::uuid
          AND instance.subject_type = 'supplier_purchase_batch'
          AND instance.subject_id = ${batchId}::text
        ORDER BY instance.created_at DESC, instance.id DESC
        LIMIT 100;
      `,
      this.database<Array<{ id: string }>>`
        SELECT task.id
        FROM public.workflow_tasks AS task
        JOIN public.workflow_instances AS instance ON instance.id = task.instance_id
        WHERE task.tenant_id = ${input.targets.tenantId}::uuid
          AND instance.subject_id = ${batchId}::text
        ORDER BY task.created_at, task.id
        LIMIT 100;
      `,
      this.database<Array<{ id: string; supplier_id: string }>>`
        SELECT purchase_order.id, purchase_order.supplier_id
        FROM public.supplier_purchase_orders AS purchase_order
        WHERE purchase_order.tenant_id = ${input.targets.tenantId}::uuid
          AND purchase_order.purchase_batch_id = ${batchId}::uuid
        ORDER BY purchase_order.id
        LIMIT 100;
      `,
    ]);
    const batch = batchRows[0];
    const instance = instanceRows[0];
    const supplierCount = new Set(
      orderRows.map(({ supplier_id }) => supplier_id),
    ).size;
    if (!batch || !instance || batch.status !== "ordered" ||
      (batch.budget_status !== "within_budget" &&
        batch.budget_status !== "over_budget") || orderRows.length === 0 ||
      supplierCount !== orderRows.length || batch.supplier_count !== supplierCount) {
      throw Errors.business(500, "采购批次审批 smoke 证据状态异常", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_EVIDENCE_INVALID");
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
    throw Errors.business(409, "采购批次审批 smoke 待办状态异常", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_TASK_INVALID");
  }
  return rows[0].id;
}

function defaultDependencies(): SmokeDependencies {
  return {
    createGateway: () => {
      const databaseUrl = process.env.SUPABASE_DB_DIRECT_URL ??
        process.env.SUPABASE_DB_URL;
      if (!databaseUrl) {
        throw Errors.business(500, "采购批次审批 smoke 缺少数据库配置", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_DATABASE_REQUIRED");
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

function smokeTargets(
  options: SupplierPurchaseBatchWorkflowSmokeOptions,
): SupplierPurchaseBatchWorkflowSmokeTargets {
  const { execute: _execute, ...targets } = options;
  return targets;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function assertResultStatus(value: unknown, expected: string): void {
  const result = asRecord(value);
  if (result?.status !== expected) {
    throw Errors.business(500, "采购批次审批 smoke 命令结果异常", "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_COMMAND_FAILED");
  }
}

async function main(): Promise<void> {
  const requestId = crypto.randomUUID();
  try {
    const options = parseSupplierPurchaseBatchWorkflowSmokeArgs(
      process.argv.slice(2),
    );
    const evidence = await runSupplierPurchaseBatchWorkflowSmoke(options, {
      ...defaultDependencies(),
      requestId: () => requestId,
    });
    console.log(JSON.stringify(evidence, null, 2));
  } catch (error) {
    console.error(JSON.stringify(
      formatSupplierPurchaseBatchWorkflowSmokeFailure(error, requestId),
    ));
    process.exitCode = 1;
  }
}

if (import.meta.main) void main();

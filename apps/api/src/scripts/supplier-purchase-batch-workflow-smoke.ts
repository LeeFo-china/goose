import { Errors } from "@/errors/error-factory";

import { defaultSupplierPurchaseBatchWorkflowSmokeDependencies } from "./supplier-purchase-batch-workflow-smoke-gateway";

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

export type SupplierPurchaseBatchWorkflowSmokeExecutionFacts = {
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
    fixturePrefix: string;
  }): Promise<SupplierPurchaseBatchWorkflowSmokeExecutionFacts>;
  close(): Promise<void>;
};

export type SupplierPurchaseBatchWorkflowSmokeDependencies = {
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
  dependencies: SupplierPurchaseBatchWorkflowSmokeDependencies =
    defaultSupplierPurchaseBatchWorkflowSmokeDependencies(),
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

function smokeTargets(
  options: SupplierPurchaseBatchWorkflowSmokeOptions,
): SupplierPurchaseBatchWorkflowSmokeTargets {
  const { execute: _execute, ...targets } = options;
  return targets;
}

async function main(): Promise<void> {
  const requestId = crypto.randomUUID();
  try {
    const options = parseSupplierPurchaseBatchWorkflowSmokeArgs(
      process.argv.slice(2),
    );
    const evidence = await runSupplierPurchaseBatchWorkflowSmoke(options, {
      ...defaultSupplierPurchaseBatchWorkflowSmokeDependencies(),
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

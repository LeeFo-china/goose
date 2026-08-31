import { describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";

import {
  formatSupplierPurchaseBatchWorkflowSmokeFailure,
  parseSupplierPurchaseBatchWorkflowSmokeArgs,
  runSupplierPurchaseBatchWorkflowSmoke,
  type SupplierPurchaseBatchWorkflowSmokeGateway,
} from "./supplier-purchase-batch-workflow-smoke";

const smokeUrl = new URL(
  "./supplier-purchase-batch-workflow-smoke.ts",
  import.meta.url,
);
const smokeGatewayUrl = new URL(
  "./supplier-purchase-batch-workflow-smoke-gateway.ts",
  import.meta.url,
);
const workflowPreflightUrl = new URL(
  "./supplier-purchase-batch-workflow-smoke-workflow-preflight.ts",
  import.meta.url,
);

function captureAppError(action: () => unknown): AppError {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(AppError);
  return caught as AppError;
}

describe("supplier purchase batch workflow smoke", () => {
  test("ships the dedicated workflow smoke implementation", async () => {
    expect(await Bun.file(smokeUrl).exists()).toBe(true);
  });

  test("is exposed through the API package release command", async () => {
    const packageJson = await Bun.file(
      new URL("../../package.json", import.meta.url),
    ).json();
    expect(packageJson.scripts["supplier:purchase-batch-workflow:smoke"])
      .toBe("bun src/scripts/supplier-purchase-batch-workflow-smoke.ts");
  });

  const ids = {
    tenantId: "91000000-0000-4000-8000-000000000001",
    projectId: "91000000-0000-4000-8000-000000000002",
    applicantEmployeeId: "91000000-0000-4000-8000-000000000003",
    purchaseApproverId: "91000000-0000-4000-8000-000000000004",
    financeApproverId: "91000000-0000-4000-8000-000000000005",
  } as const;

  const argv = [
    "--tenant-id",
    ids.tenantId,
    "--project-id",
    ids.projectId,
    "--applicant-employee-id",
    ids.applicantEmployeeId,
    "--purchase-approver-id",
    ids.purchaseApproverId,
    "--finance-approver-id",
    ids.financeApproverId,
  ];

  test("requires exactly five explicit UUID targets and defaults to dry-run", () => {
    expect(parseSupplierPurchaseBatchWorkflowSmokeArgs(argv)).toEqual({
      ...ids,
      execute: false,
    });
    expect(parseSupplierPurchaseBatchWorkflowSmokeArgs([...argv, "--execute"]))
      .toEqual({ ...ids, execute: true });
    expect(() => parseSupplierPurchaseBatchWorkflowSmokeArgs([]))
      .toThrow(AppError);
    expect(() => parseSupplierPurchaseBatchWorkflowSmokeArgs([
      ...argv.slice(0, -1),
      "not-a-uuid",
    ])).toThrow(AppError);
    expect(() => parseSupplierPurchaseBatchWorkflowSmokeArgs([
      ...argv,
      "--unknown",
    ])).toThrow(AppError);
    const invalid = captureAppError(() =>
      parseSupplierPurchaseBatchWorkflowSmokeArgs([])
    );
    expect(invalid).toMatchObject({
      statusCode: 400,
      code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_ARGUMENT_INVALID",
    });
  });

  test("inspects prerequisites without writes in the default dry-run", async () => {
    const inspect = mock(async () => ({
      applicantUserId: "91000000-0000-4000-8000-000000000006",
      purchaseApproverUserId: "91000000-0000-4000-8000-000000000009",
      financeApproverUserId: "91000000-0000-4000-8000-00000000000a",
      supplierSkuId: "91000000-0000-4000-8000-000000000007",
      costCategoryId: "91000000-0000-4000-8000-000000000008",
      purchaseApproverReady: true,
      financeApproverReady: true,
    } as const));
    const execute = mock(async () => {
      throw new Error("dry-run must not execute");
    });
    const close = mock(async () => {});
    const gateway: SupplierPurchaseBatchWorkflowSmokeGateway = {
      inspect,
      execute,
      close,
    };

    const result = await runSupplierPurchaseBatchWorkflowSmoke(
      { ...ids, execute: false },
      {
        createGateway: () => gateway,
        requestId: () => "92000000-0000-4000-8000-000000000001",
      },
    );

    expect(inspect).toHaveBeenCalledWith(ids);
    expect(execute).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      mode: "dry-run",
      requestId: "92000000-0000-4000-8000-000000000001",
      fixturePrefix: "SPBW-SMOKE",
      batchId: null,
      approvalRound: null,
      instanceId: null,
      taskIds: [],
      budgetState: "preflight_ready",
      orderIds: [],
      supplierCount: 0,
      cleanupRecommendation: "dry-run 未写入，无需清理",
    });
  });

  test("executes only when requested and returns bounded evidence identifiers", async () => {
    const prerequisites = {
      applicantUserId: "91000000-0000-4000-8000-000000000006",
      purchaseApproverUserId: "91000000-0000-4000-8000-000000000009",
      financeApproverUserId: "91000000-0000-4000-8000-00000000000a",
      supplierSkuId: "91000000-0000-4000-8000-000000000007",
      costCategoryId: "91000000-0000-4000-8000-000000000008",
      purchaseApproverReady: true,
      financeApproverReady: true,
    } as const;
    const execute = mock(async () => ({
      batchId: "93000000-0000-4000-8000-000000000001",
      approvalRound: 1,
      instanceId: "93000000-0000-4000-8000-000000000002",
      taskIds: ["93000000-0000-4000-8000-000000000003"],
      budgetState: "within_budget" as const,
      orderIds: ["93000000-0000-4000-8000-000000000004"],
      supplierCount: 1,
    }));
    const gateway: SupplierPurchaseBatchWorkflowSmokeGateway = {
      inspect: mock(async () => prerequisites),
      execute,
      close: mock(async () => {}),
    };
    const result = await runSupplierPurchaseBatchWorkflowSmoke(
      { ...ids, execute: true },
      {
        createGateway: () => gateway,
        requestId: () => "92000000-0000-4000-8000-000000000002",
      },
    );

    expect(execute).toHaveBeenCalledWith({
      targets: ids,
      prerequisites,
      requestId: "92000000-0000-4000-8000-000000000002",
      fixturePrefix: "SPBW-SMOKE",
    });
    expect(result).toMatchObject({
      ok: true,
      mode: "execute",
      requestId: "92000000-0000-4000-8000-000000000002",
      batchId: "93000000-0000-4000-8000-000000000001",
      approvalRound: 1,
      instanceId: "93000000-0000-4000-8000-000000000002",
      taskIds: ["93000000-0000-4000-8000-000000000003"],
      budgetState: "within_budget",
      orderIds: ["93000000-0000-4000-8000-000000000004"],
      supplierCount: 1,
    });
    expect(result.cleanupRecommendation).toContain("不自动删除");
  });

  test("uses bounded reads and emits only a sanitized stable failure", async () => {
    const source = await Bun.file(smokeUrl).text();
    const gatewaySource = await Bun.file(smokeGatewayUrl).text();
    const workflowPreflightSource = await Bun.file(workflowPreflightUrl).text();
    const databaseSource = gatewaySource + workflowPreflightSource;
    expect(source).not.toContain("throw new Error");
    expect(gatewaySource).not.toContain("throw new Error");
    expect(source).toContain('import { Errors } from "@/errors/error-factory"');
    expect(gatewaySource.match(/complete_supplier_purchase_batch_workflow_task/g))
      .toHaveLength(2);
    expect(gatewaySource).not.toContain(".begin(");
    expect(gatewaySource).toContain("batch.status !== \"ordered\"");
    expect(gatewaySource).toContain("purchase_order.status !== \"submitted\"");
    const orderEvidenceQuery = gatewaySource.slice(
      gatewaySource.indexOf("SELECT purchase_order.id"),
      gatewaySource.indexOf("ORDER BY purchase_order.id"),
    );
    expect(orderEvidenceQuery).not.toContain("AND purchase_order.status");
    expect(orderEvidenceQuery).toContain("COUNT(*) OVER()");
    expect(gatewaySource).toContain(
      "orderRows[0]?.total_count !== orderRows.length",
    );
    expect(gatewaySource).toContain("supplierCount");
    expect(gatewaySource).toContain("p_page_size => 20");
    expect(databaseSource).toContain("__gooes_workflow_node_has_candidate");
    expect(databaseSource).toContain("__gooes_workflow_task_projection");
    expect(databaseSource).toContain("explicit_approver_ready");
    expect(databaseSource).toContain("assignee_employee_id");
    expect(databaseSource).toContain("assignee_role_code");
    expect(databaseSource).toContain("assignee_permission_code");
    expect(databaseSource).toContain("supplier_purchase_batch_approval");
    for (const flag of [
      "module_enabled",
      "ownership_reads_enabled",
      "private_supplier_writes_enabled",
      "private_catalog_writes_enabled",
      "procurement_snapshot_v1_enabled",
      "purchase_batch_workflow_enabled",
    ]) expect(gatewaySource).toContain(flag);
    expect(gatewaySource).toMatch(/LIMIT 100/);
    expect(gatewaySource).not.toMatch(
      /LIMIT\s+(?:10[1-9]|1[1-9]\d|[2-9]\d{2,})/,
    );

    const failure = formatSupplierPurchaseBatchWorkflowSmokeFailure(
      new AppError(
        500,
        "postgres://private-user:private-pass@private.invalid/db phone=13800138000",
        "PRIVATE_ERROR",
        { password: "private-pass" },
      ),
      "92000000-0000-4000-8000-000000000003",
    );
    expect(failure).toEqual({
      ok: false,
      code: "SUPPLIER_PURCHASE_BATCH_WORKFLOW_SMOKE_FAILED",
      requestId: "92000000-0000-4000-8000-000000000003",
    });
    expect(JSON.stringify(failure)).not.toContain("private");
    expect(JSON.stringify(failure)).not.toContain("13800138000");
  });
});

import { describe, expect, mock, test } from "bun:test";

const TENANT_ID = "a2000000-0000-4000-8000-000000000001";

const baseSettings = {
  tenant_id: TENANT_ID,
  module_enabled: true,
  ownership_reads_enabled: true,
  private_supplier_writes_enabled: true,
  private_catalog_writes_enabled: true,
  procurement_snapshot_v1_enabled: true,
  purchase_batch_workflow_enabled: false,
};

describe("SupplierPurchaseBatchWorkflowRuntime", () => {
  test("derives the workflow mode from effective tenant rollout settings", async () => {
    const getSettings = mock(async () => baseSettings);
    const { SupplierPurchaseBatchWorkflowRuntime } = await import(
      "./supplier-purchase-batch-workflow-runtime"
    );
    const runtime = new SupplierPurchaseBatchWorkflowRuntime({
      settingsRepository: { getSettings },
      workflowRepository: {
        submitWithWorkflow: mock(async () => ({ status: "submitted" })),
      },
    } as never);

    expect(await runtime.isEnabled(TENANT_ID)).toBe(false);
    getSettings.mockImplementation(async () => ({
      ...baseSettings,
      purchase_batch_workflow_enabled: true,
    }));
    expect(await runtime.isEnabled(TENANT_ID)).toBe(true);
    expect(getSettings).toHaveBeenCalledTimes(2);
  });

  test("uses only the dedicated repository for workflow submission", async () => {
    const result = { status: "submitted", workflow_state: {
      current_node_key: "purchase_review",
    } };
    const submit = mock(async () => result as never);
    const { SupplierPurchaseBatchWorkflowRuntime } = await import(
      "./supplier-purchase-batch-workflow-runtime"
    );
    const runtime = new SupplierPurchaseBatchWorkflowRuntime({
      settingsRepository: { getSettings: mock(async () => baseSettings) },
      workflowRepository: { submitWithWorkflow: submit },
    } as never);
    const input = { tenant_id: TENANT_ID } as never;

    expect(await runtime.submit(input)).toBe(result as never);
    expect(submit).toHaveBeenCalledWith(input);
  });
});

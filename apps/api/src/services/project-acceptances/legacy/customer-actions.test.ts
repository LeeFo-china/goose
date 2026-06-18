import { beforeEach, describe, expect, mock, test } from "bun:test";

const acceptanceRow = {
  id: "acceptance-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  acceptance_type: "stage",
  stage_code: "plumbing_electrical",
  template_id: null,
  template_version: 1,
  template_snapshot: null,
  title: "水电验收",
  status: "leader_approved",
  initiator_id: "employee-1",
  reviewer_id: "leader-1",
  customer_id: "customer-1",
  summary: null,
  submitted_at: "2026-06-18T00:00:00.000Z",
  reviewed_at: "2026-06-18T00:10:00.000Z",
  customer_confirmed_at: null,
  completed_at: null,
  rejected_at: null,
  reject_reason: null,
  reject_source: null,
  created_at: "2026-06-18T00:00:00.000Z",
  updated_at: "2026-06-18T00:10:00.000Z",
};

const confirmedAcceptanceRow = {
  ...acceptanceRow,
  status: "customer_confirmed",
  customer_confirmed_at: "2026-06-18T00:20:00.000Z",
  completed_at: "2026-06-18T00:20:00.000Z",
  updated_at: "2026-06-18T00:20:00.000Z",
};

const updateAcceptance = mock(async () => confirmedAcceptanceRow);
const syncCustomerConfirmAcceptance = mock(async () => ({
  status: "already_advanced",
  workflow_key: "construction_main",
  definition_id: "definition-1",
  instance_id: "instance-1",
  current_node_key: "payment_stage_2",
  reason: "current_payment_gate_after_stage",
}));

mock.module("@/repositories/project-acceptances", () => ({
  projectAcceptanceRepository: {
    updateAcceptance,
  },
}));

mock.module("@/services/project-acceptance-workflow-runtime", () => ({
  projectAcceptanceWorkflowRuntimeService: {
    syncCustomerConfirmAcceptance,
  },
}));

mock.module("@/services/project-workflow-mutation-guards", () => ({
  assertProjectWorkflowStageMutationAllowed: mock(async () => undefined),
}));

describe("customerConfirmAcceptance", () => {
  beforeEach(() => {
    updateAcceptance.mockClear();
    syncCustomerConfirmAcceptance.mockClear();
  });

  test("accepts already advanced workflow runtime when confirming the previous procedure acceptance", async () => {
    const { customerConfirmAcceptance } = await import("./customer-actions");
    const recordAction = mock(async () => undefined);
    const invalidateAcceptanceRelatedCaches = mock(() => undefined);
    const serviceContext = {
      getRequiredAcceptance: mock(async () => acceptanceRow),
      resolveCustomerActor: mock(async () => ({ id: "customer-1" })),
      recordAction,
      invalidateAcceptanceRelatedCaches,
      buildDetail: mock((row: typeof confirmedAcceptanceRow) => row),
    };

    const result = await customerConfirmAcceptance.call(
      serviceContext,
      null,
      acceptanceRow.id,
      {
        comment: "客户确认通过",
        project_id: acceptanceRow.project_id,
      },
      {
        tenantId: acceptanceRow.tenant_id,
        customerId: acceptanceRow.customer_id,
      },
    );

    expect(result.status).toBe("customer_confirmed");
    expect(updateAcceptance).toHaveBeenCalledWith(
      acceptanceRow.id,
      expect.objectContaining({
        status: "customer_confirmed",
      }),
      acceptanceRow.tenant_id,
    );
    expect(syncCustomerConfirmAcceptance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      acceptanceId: "acceptance-1",
      stageCode: "plumbing_electrical",
      customerId: "customer-1",
      comment: "客户确认通过",
    });
    expect(recordAction).toHaveBeenCalledWith(expect.objectContaining({
      action: "customer_confirm",
      fromStatus: "leader_approved",
      toStatus: "customer_confirmed",
      operatorType: "customer",
      operatorId: "customer-1",
    }));
    expect(invalidateAcceptanceRelatedCaches).toHaveBeenCalledWith("project-1");
  });
});

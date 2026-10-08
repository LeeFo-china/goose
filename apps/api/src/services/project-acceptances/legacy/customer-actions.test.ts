import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { ProjectAcceptanceRow, ProjectAcceptanceProjectRow } from "@/repositories/project-acceptances";
import type { ProjectAcceptanceWorkflowRuntimeMetadata } from "@/services/project-acceptance-workflow-runtime";

const acceptanceRow: ProjectAcceptanceRow = {
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

const confirmedAcceptanceRow: ProjectAcceptanceRow = {
  ...acceptanceRow,
  status: "customer_confirmed",
  customer_confirmed_at: "2026-06-18T00:20:00.000Z",
  completed_at: "2026-06-18T00:20:00.000Z",
  updated_at: "2026-06-18T00:20:00.000Z",
};

const finalAcceptanceRow: ProjectAcceptanceRow = {
  ...acceptanceRow,
  id: "acceptance-final",
  acceptance_type: "final",
  stage_code: "completion",
  title: "竣工交付验收",
};

const confirmedFinalAcceptanceRow: ProjectAcceptanceRow = {
  ...finalAcceptanceRow,
  status: "customer_confirmed",
  customer_confirmed_at: "2026-06-18T00:20:00.000Z",
  completed_at: "2026-06-18T00:20:00.000Z",
  updated_at: "2026-06-18T00:20:00.000Z",
};


const project: ProjectAcceptanceProjectRow = {
  id: "project-1", tenant_id: "tenant-1", name: "验收测试项目", customer_id: "customer-1", status: "constructing",
};
const getProject = mock(async (): Promise<ProjectAcceptanceProjectRow | null> => project);
const updateAcceptance = mock(async () => confirmedAcceptanceRow);
const syncCustomerConfirmAcceptance = mock(async (): Promise<ProjectAcceptanceWorkflowRuntimeMetadata> => ({
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
    getProject,
  },
}));

mock.module("@/services/project-acceptance-workflow-runtime", () => ({
  projectAcceptanceWorkflowRuntimeService: {
    syncCustomerConfirmAcceptance,
  },
}));

const assertProjectWorkflowStageMutationAllowed = mock(async () => undefined);
mock.module("@/services/project-workflow-mutation-guards", () => ({
  assertProjectWorkflowStageMutationAllowed,
}));

describe("customerConfirmAcceptance", () => {
  beforeEach(() => {
    assertProjectWorkflowStageMutationAllowed.mockReset();
    assertProjectWorkflowStageMutationAllowed.mockImplementation(async () => undefined);
    getProject.mockReset();
    getProject.mockImplementation(async () => project);
    updateAcceptance.mockReset();
    updateAcceptance.mockImplementation(async () => confirmedAcceptanceRow);
    syncCustomerConfirmAcceptance.mockReset();
    syncCustomerConfirmAcceptance.mockImplementation(async () => ({ status: "already_advanced", reason: "completed_procedure_already_advanced" }));
  });

  test("guard 409 leaves confirmation unwritten until construction finishes, then retries once", async () => {
    let stored = { ...acceptanceRow };
    let procedureCompleted = false;
    assertProjectWorkflowStageMutationAllowed.mockImplementation(async () => {
      if (!procedureCompleted) throw Errors.business(409, "当前工序尚未完工", "WORKFLOW_PROCEDURE_NOT_COMPLETED");
    });
    updateAcceptance.mockImplementation(async () => {
      stored = { ...confirmedAcceptanceRow };
      return stored;
    });
    const context = makeContext();
    context.getRequiredAcceptance.mockImplementation(async () => stored);
    const { customerConfirmAcceptance } = await import("./customer-actions");
    for (let attempt = 0; attempt < 2; attempt++) {
      await expect(customerConfirmAcceptance.call(context, "user-1", stored.id, confirmInput, actorScope))
        .rejects.toMatchObject({ statusCode: 409, code: "WORKFLOW_PROCEDURE_NOT_COMPLETED" });
    }
    expect(assertProjectWorkflowStageMutationAllowed).toHaveBeenCalledWith({
      tenantId: "tenant-1", projectId: "project-1", stageCode: "plumbing_electrical", mutation: "customer_confirm_acceptance",
    });
    expect(stored.status).toBe("leader_approved");
    expect(updateAcceptance).not.toHaveBeenCalled();
    expect(context.recordAction).not.toHaveBeenCalled();
    expect(syncCustomerConfirmAcceptance).not.toHaveBeenCalled();
    expect(context.invalidateAcceptanceRelatedCaches).not.toHaveBeenCalled();
    procedureCompleted = true;
    await expect(customerConfirmAcceptance.call(context, "user-1", stored.id, confirmInput, actorScope))
      .resolves.toMatchObject({ status: "customer_confirmed" });
    expect(updateAcceptance).toHaveBeenCalledTimes(1);
    expect(context.recordAction).toHaveBeenCalledTimes(1);
    expect(syncCustomerConfirmAcceptance).toHaveBeenCalledTimes(1);
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

  test("syncs workflow runtime when customer confirms final completion acceptance", async () => {
    updateAcceptance.mockImplementationOnce(async () => confirmedFinalAcceptanceRow);
    syncCustomerConfirmAcceptance.mockImplementationOnce(async () => ({
      status: "advanced",
      workflow_key: "construction_main",
      definition_id: "definition-1",
      instance_id: "instance-1",
      node_key: "final_acceptance",
      current_node_key: "handover",
      next_node_key: "handover",
    }));

    const { customerConfirmAcceptance } = await import("./customer-actions");
    const serviceContext = {
      getRequiredAcceptance: mock(async () => finalAcceptanceRow),
      resolveCustomerActor: mock(async () => ({ id: "customer-1" })),
      recordAction: mock(async () => undefined),
      invalidateAcceptanceRelatedCaches: mock(() => undefined),
      buildDetail: mock((row: typeof confirmedFinalAcceptanceRow) => row),
    };

    const result = await customerConfirmAcceptance.call(
      serviceContext,
      null,
      finalAcceptanceRow.id,
      {
        comment: "竣工确认通过",
        project_id: finalAcceptanceRow.project_id,
      },
      {
        tenantId: finalAcceptanceRow.tenant_id,
        customerId: finalAcceptanceRow.customer_id,
      },
    );

    expect(result.status).toBe("customer_confirmed");
    expect(syncCustomerConfirmAcceptance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      acceptanceId: "acceptance-final",
      stageCode: "completion",
      customerId: "customer-1",
      comment: "竣工确认通过",
    });
  });

  test("resyncs workflow runtime when a previous customer confirm already updated acceptance status", async () => {
    syncCustomerConfirmAcceptance.mockImplementationOnce(async () => ({
      status: "advanced",
      workflow_key: "construction_main",
      definition_id: "definition-1",
      instance_id: "instance-1",
      node_key: "procedure_plumbing_electrical",
      current_node_key: "payment_stage_2",
      next_node_key: "payment_stage_2",
    }));

    const { customerConfirmAcceptance } = await import("./customer-actions");
    const recordAction = mock(async () => undefined);
    const serviceContext = {
      getRequiredAcceptance: mock(async () => confirmedAcceptanceRow),
      resolveCustomerActor: mock(async () => ({ id: "customer-1" })),
      recordAction,
      invalidateAcceptanceRelatedCaches: mock(() => undefined),
      buildDetail: mock((row: typeof confirmedAcceptanceRow) => row),
    };

    const result = await customerConfirmAcceptance.call(
      serviceContext,
      null,
      confirmedAcceptanceRow.id,
      {
        comment: "重复确认后补偿推进",
        project_id: confirmedAcceptanceRow.project_id,
      },
      {
        tenantId: confirmedAcceptanceRow.tenant_id,
        customerId: confirmedAcceptanceRow.customer_id,
      },
    );

    expect(result.status).toBe("customer_confirmed");
    expect(updateAcceptance).not.toHaveBeenCalled();
    expect(recordAction).not.toHaveBeenCalled();
    expect(syncCustomerConfirmAcceptance).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: "project-1",
      acceptanceId: "acceptance-1",
      stageCode: "plumbing_electrical",
      customerId: "customer-1",
      comment: "重复确认后补偿推进",
    });
  });

  test.each(["leader_approved", "customer_confirmed"] as const)("rejects a former project customer before status write or catchup (%s)", async (status) => {
    const row = status === "customer_confirmed" ? confirmedAcceptanceRow : acceptanceRow;
    getProject.mockImplementationOnce(async () => ({ ...project, customer_id: "new-customer" }));
    const context = makeContext(row);
    const { customerConfirmAcceptance } = await import("./customer-actions");
    await expect(customerConfirmAcceptance.call(context, "user-1", row.id, confirmInput, actorScope))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(getProject).toHaveBeenCalledWith(row.project_id, row.tenant_id);
    expect(updateAcceptance).not.toHaveBeenCalled();
    expect(context.recordAction).not.toHaveBeenCalled();
    expect(syncCustomerConfirmAcceptance).not.toHaveBeenCalled();
  });

  test.each([null, { ...project, tenant_id: "other-tenant" }])("rejects missing or cross-tenant project facts", async (projectRow) => {
    getProject.mockImplementationOnce(async () => projectRow);
    const context = makeContext();
    const { customerConfirmAcceptance } = await import("./customer-actions");
    await expect(customerConfirmAcceptance.call(context, "user-1", acceptanceRow.id, confirmInput, actorScope))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(updateAcceptance).not.toHaveBeenCalled();
    expect(syncCustomerConfirmAcceptance).not.toHaveBeenCalled();
  });

  test("keeps customer identity checks on already confirmed retries", async () => {
    const context = makeContext(confirmedAcceptanceRow);
    context.resolveCustomerActor.mockImplementationOnce(async () => { throw Errors.forbidden(); });
    const { customerConfirmAcceptance } = await import("./customer-actions");
    await expect(customerConfirmAcceptance.call(context, "wrong-user", acceptanceRow.id, confirmInput, actorScope))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(getProject).not.toHaveBeenCalled();
    expect(syncCustomerConfirmAcceptance).not.toHaveBeenCalled();
  });

  test("commits confirmation before RPC and retries a failed sync without rewriting status or audit", async () => {
    let stored = { ...acceptanceRow };
    const events: string[] = [];
    updateAcceptance.mockImplementationOnce(async () => {
      stored = { ...confirmedAcceptanceRow };
      events.push("status_committed");
      return stored;
    });
    syncCustomerConfirmAcceptance.mockImplementationOnce(async () => {
      expect(stored.status).toBe("customer_confirmed");
      events.push("rpc_failed");
      return { status: "failed", reason: "procedure_not_completed" };
    });
    const context = makeContext();
    context.getRequiredAcceptance.mockImplementation(async () => stored);
    context.recordAction.mockImplementation(async () => { events.push("audit"); });
    context.invalidateAcceptanceRelatedCaches.mockImplementation(() => { events.push("invalidate"); });
    const { customerConfirmAcceptance } = await import("./customer-actions");
    await expect(customerConfirmAcceptance.call(context, "user-1", stored.id, confirmInput, actorScope))
      .rejects.toMatchObject({ statusCode: 409, details: {
        workflow_runtime: { status: "failed", reason: "procedure_not_completed" },
      } });
    expect(events).toEqual(["status_committed", "audit", "rpc_failed", "invalidate"]);
    syncCustomerConfirmAcceptance.mockImplementationOnce(async () => ({ status: "advanced" }));
    await expect(customerConfirmAcceptance.call(context, "user-1", stored.id, confirmInput, actorScope))
      .resolves.toMatchObject({ status: "customer_confirmed" });
    expect(updateAcceptance).toHaveBeenCalledTimes(1);
    expect(context.recordAction).toHaveBeenCalledTimes(1);
    expect(syncCustomerConfirmAcceptance).toHaveBeenCalledTimes(2);
    expect(context.resolveCustomerActor).toHaveBeenCalledTimes(2);
    expect(context.invalidateAcceptanceRelatedCaches).toHaveBeenCalledTimes(2);
  });

  test("failed status write never reaches audit or RPC", async () => {
    updateAcceptance.mockImplementationOnce(async () => { throw Errors.dbError("确认写入失败"); });
    const context = makeContext();
    const { customerConfirmAcceptance } = await import("./customer-actions");
    await expect(customerConfirmAcceptance.call(context, "user-1", acceptanceRow.id, confirmInput, actorScope))
      .rejects.toThrow("确认写入失败");
    expect(context.recordAction).not.toHaveBeenCalled();
    expect(syncCustomerConfirmAcceptance).not.toHaveBeenCalled();
  });

  test("invalidates a persisted confirmation even when audit writing fails", async () => {
    const context = makeContext();
    context.recordAction.mockImplementationOnce(async () => { throw Errors.dbError("审计写入失败"); });
    const { customerConfirmAcceptance } = await import("./customer-actions");
    await expect(customerConfirmAcceptance.call(context, "user-1", acceptanceRow.id, confirmInput, actorScope))
      .rejects.toThrow("审计写入失败");
    expect(updateAcceptance).toHaveBeenCalledTimes(1);
    expect(syncCustomerConfirmAcceptance).not.toHaveBeenCalled();
    expect(context.invalidateAcceptanceRelatedCaches).toHaveBeenCalledWith(acceptanceRow.project_id);
  });

  test.each(["acceptance_required", "acceptance_not_confirmed", "procedure_not_completed"])(
    "preserves SQL denial %s and invalidates cache on a failed confirmed retry", async (reason) => {
      syncCustomerConfirmAcceptance.mockImplementationOnce(async () => ({ status: "failed", reason }));
      const context = makeContext(confirmedAcceptanceRow);
      const { customerConfirmAcceptance } = await import("./customer-actions");
      await expect(customerConfirmAcceptance.call(context, "user-1", acceptanceRow.id, confirmInput, actorScope))
        .rejects.toMatchObject({ statusCode: 409, code: "WORKFLOW_PROGRESS_CONFLICT", details: {
          acceptance_id: acceptanceRow.id, project_id: acceptanceRow.project_id,
          stage_code: "plumbing_electrical", workflow_runtime: { status: "failed", reason },
        } });
      expect(updateAcceptance).not.toHaveBeenCalled();
      expect(context.recordAction).not.toHaveBeenCalled();
      expect(context.invalidateAcceptanceRelatedCaches).toHaveBeenCalledWith(acceptanceRow.project_id);
    },
  );

});


const actorScope = { tenantId: "tenant-1", customerId: "customer-1" };
const confirmInput = { project_id: "project-1", comment: "客户确认通过" };
function makeContext(row: ProjectAcceptanceRow = acceptanceRow) {
  return {
    getRequiredAcceptance: mock(async () => row),
    resolveCustomerActor: mock(async () => ({ id: "customer-1" })),
    recordAction: mock(async () => undefined),
    invalidateAcceptanceRelatedCaches: mock((_projectId: string) => undefined),
    buildDetail: mock((confirmed: ProjectAcceptanceRow) => confirmed),
  };
}

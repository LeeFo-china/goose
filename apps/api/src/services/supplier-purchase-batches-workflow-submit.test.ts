import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "a3000000-0000-4000-8000-000000000001";
const BATCH_ID = "a3000000-0000-4000-8000-000000000002";
const PROJECT_ID = "a3000000-0000-4000-8000-000000000003";
const USER_ID = "a3000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "a3000000-0000-4000-8000-000000000005";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  permissions: [],
} as unknown as AuthContext;

async function subject() {
  const { SupplierPurchaseBatchesService } = await import(
    "@/services/supplier-purchase-batches"
  );
  const scope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
  };
  const legacySubmit = mock(async () => ({ status: "submitted" }));
  const workflowSubmit = mock(async () => ({
    status: "submitted",
    workflow_state: { current_node_key: "purchase_review" },
  }));
  const workflowRuntime = {
    isEnabled: mock(async () => true),
    submit: workflowSubmit,
  };
  const service = new SupplierPurchaseBatchesService({
    access: {
      requireManage: mock(async () => scope),
      getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      findBatch: mock(async () => ({
        id: BATCH_ID,
        tenant_id: TENANT_ID,
        project_id: PROJECT_ID,
        status: "draft",
        version: 1,
      })),
      submit: legacySubmit,
    },
    workflowRuntime,
  } as never);
  return { service, legacySubmit, workflowSubmit };
}

describe("SupplierPurchaseBatchesService workflow submit rollout", () => {
  test("routes enabled tenants only to atomic workflow submission", async () => {
    const { service, legacySubmit, workflowSubmit } = await subject();

    const result = await service.submit(
      auth,
      BATCH_ID,
      { expected_version: 1 },
      "batch:workflow-submit",
    );

    expect(result).toMatchObject({
      status: "submitted",
      workflow_state: { current_node_key: "purchase_review" },
    });
    expect(workflowSubmit).toHaveBeenCalledWith(expect.objectContaining({
      tenant_id: TENANT_ID,
      batch_id: BATCH_ID,
      expected_version: 1,
      idempotency_key: "batch:workflow-submit",
    }));
    expect(legacySubmit).not.toHaveBeenCalled();
  });

  test("never falls back to legacy submit after a workflow failure", async () => {
    const { service, legacySubmit, workflowSubmit } = await subject();
    workflowSubmit.mockImplementation(async () => {
      throw Errors.business(
        409,
        "采购批次审批流程缺少可用审批人",
        "SUPPLIER_PURCHASE_BATCH_NO_APPROVER",
      );
    });

    await expect(service.submit(
      auth,
      BATCH_ID,
      { expected_version: 1 },
      "batch:workflow-failure",
    )).rejects.toMatchObject({
      code: "SUPPLIER_PURCHASE_BATCH_NO_APPROVER",
    });
    expect(legacySubmit).not.toHaveBeenCalled();
  });
});

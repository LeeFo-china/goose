import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "68100000-0000-4000-8000-000000000001";
const BATCH_ID = "68100000-0000-4000-8000-000000000002";
const PROJECT_ID = "68100000-0000-4000-8000-000000000003";
const USER_ID = "68100000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "68100000-0000-4000-8000-000000000005";
const OTHER_EMPLOYEE_ID = "68100000-0000-4000-8000-000000000006";
const SKU_ID = "68100000-0000-4000-8000-000000000007";
const COST_CATEGORY_ID = "68100000-0000-4000-8000-000000000008";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  permissions: [],
} as unknown as AuthContext;

async function harness(submittedByEmployeeId: string, status = "pending_approval") {
  const scope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
  };
  const withdraw = mock(async (input: unknown) => ({
    status: "withdrawn",
    input,
  }));
  const assertProjectUpdate = mock(async () => undefined);
  const saveDraft = mock(async () => ({ status: "saved" }));
  const { SupplierPurchaseBatchesService } = await import(
    "./supplier-purchase-batches"
  );
  return {
    withdraw,
    saveDraft,
    assertProjectUpdate,
    service: new SupplierPurchaseBatchesService({
      access: {
        requireManage: mock(async () => scope),
        getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
        assertProjectUpdate,
      },
      repository: {
        findBatch: mock(async () => ({
          id: BATCH_ID,
          tenant_id: TENANT_ID,
          project_id: PROJECT_ID,
          status,
          submitted_by_employee_id: submittedByEmployeeId,
        })),
        saveDraft,
      },
      workflowRepository: { withdraw },
    } as never),
  };
}

describe("SupplierPurchaseBatchesService withdraw", () => {
  test("requires project update scope and forwards the submitter identity", async () => {
    const subject = await harness(EMPLOYEE_ID);
    await subject.service.withdraw(auth, BATCH_ID, {
      expected_version: 2,
      reason: "采购内容需调整",
    }, "batch:withdraw");

    expect(subject.assertProjectUpdate).toHaveBeenCalledWith(auth, PROJECT_ID);
    expect(subject.withdraw).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      batchId: BATCH_ID,
      expectedVersion: 2,
      reason: "采购内容需调整",
      actorUserId: USER_ID,
      actorEmployeeId: EMPLOYEE_ID,
      idempotencyKey: "batch:withdraw",
    });
  });

  test("rejects a scoped employee who did not submit the active round", async () => {
    const subject = await harness(OTHER_EMPLOYEE_ID);
    await expect(subject.service.withdraw(auth, BATCH_ID, {
      expected_version: 2,
    }, "batch:withdraw:forbidden")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(subject.withdraw).not.toHaveBeenCalled();
  });

  test("allows only the rejected-round submitter to save modifications", async () => {
    const subject = await harness(OTHER_EMPLOYEE_ID, "rejected");
    await expect(subject.service.saveDraft(auth, BATCH_ID, {
      project_id: PROJECT_ID,
      expected_version: 3,
      reason: "调整数量",
      items: [{
        supplier_sku_id: SKU_ID,
        cost_category_id: COST_CATEGORY_ID,
        quantity: "1",
      }],
    }, "batch:rejected:save")).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(subject.saveDraft).not.toHaveBeenCalled();
  });
});

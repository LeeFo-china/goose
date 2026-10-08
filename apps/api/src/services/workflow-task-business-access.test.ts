import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { TenantServiceAccessMode } from "@gooes/domain";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let access: typeof import("./tenant-service-access");
let PaymentBridge: typeof import("./workflow-task-payment-bridge").WorkflowTaskPaymentBridge;
let completeSupplier: typeof import("./workflow-task-supplier-purchase-batch-completion")
  .completeSupplierPurchaseBatchWorkflowTask;
beforeAll(async () => {
  access = await import("./tenant-service-access");
  PaymentBridge = (await import("./workflow-task-payment-bridge")).WorkflowTaskPaymentBridge;
  completeSupplier = (await import("./workflow-task-supplier-purchase-batch-completion"))
    .completeSupplierPurchaseBatchWorkflowTask;
});
afterEach(() => mock.restore());

const authContext: AuthContext = {
  authUserId: "auth-1", employeeId: "employee-1", tenantId: "tenant-1",
  tenantStatus: "active", isPlatformAdmin: false, employeeName: "审批人",
  employeeStatus: "active", roleCodes: [], roles: [], permissions: [],
  tenantName: null, tenantSlug: null, departmentId: null,
  tenantDepartmentId: null, departmentCode: null, departmentName: null,
  postId: null, postName: null, avatar: null,
};
function serviceAccess(mode: TenantServiceAccessMode) {
  return spyOn(access.tenantServiceAccessService, "resolveForRoute")
    .mockImplementation(async (request) => access.resolveTenantServiceRouteDecision({
      ...request, mode, startsAt: null, endsAt: null,
      capabilities: mode === "grace"
        ? ["core.workflows", "business.finance", "business.procurement"]
        : ["core.workflows"],
    }));
}
function paymentHarness() {
  const mutate = mock(async (): Promise<never> => {
    throw Errors.business(500, "不应执行财务写入", "UNEXPECTED_MUTATION");
  });
  const bridge = new PaymentBridge({
    paymentRepository: { findByWorkflowTaskId: mock(async () => null), create: mutate },
    financeLedgerService: { createProjectPaymentLedger: mutate },
    projectReceivablesService: {
      prepareWorkflowPaymentReceivable: mutate, allocateWorkflowPayment: mutate,
    },
    workflowRepository: { completeRuntimeNode: mutate },
    workflowSubjectStateService: { syncFromRuntimeInstance: mutate },
  });
  const input = {
    authContext, action: "complete", output: {
      amount: 100, evidence_images: ["receipt.jpg"], remark: "收到款项",
    },
    task: {
      id: "task-1", tenant_id: "tenant-1", definition_id: "definition-1",
      instance_id: "instance-1", instance_node_id: null, created_at: null,
      node_key: "payment_stage_1", instance: {
        subject_id: "project-1", current_node_snapshot: { business_kind: "payment_collection" },
      },
    },
  };
  return { bridge, mutate, input };
}
function supplierInput(subjectType = "supplier_purchase_batch") {
  return {
    authContext, action: "approve", reason: null, output: {}, idempotencyKey: "review-1",
    task: { id: "task-1", tenant_id: "tenant-1", node_key: "purchase_review",
      instance: { subject_type: subjectType, subject_id: "batch-1" } },
  };
}

test.each([
  ["trial", "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED"],
  ["grace", "TENANT_SERVICE_READ_ONLY"],
] as const)("project payment blocks %s before any financial effect", async (mode, code) => {
  serviceAccess(mode);
  const { bridge, mutate, input } = paymentHarness();
  await expect(bridge.complete(input)).rejects.toMatchObject({ code });
  expect(mutate).not.toHaveBeenCalled();
});

test("non-payment project nodes never require finance capability", async () => {
  const guard = serviceAccess("trial");
  const { bridge, mutate, input } = paymentHarness();
  input.task.instance.current_node_snapshot.business_kind = "procedure_template";
  await expect(bridge.complete(input)).resolves.toBeNull();
  expect(guard).not.toHaveBeenCalled();
  expect(mutate).not.toHaveBeenCalled();
});

test.each([
  ["trial", "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED"],
  ["grace", "TENANT_SERVICE_READ_ONLY"],
] as const)("supplier completion blocks %s before entering the mutation bridge", async (mode, code) => {
  serviceAccess(mode);
  const complete = mock(async () => ({ status: "ordered" }));
  await expect(completeSupplier(supplierInput(), { complete })).rejects.toMatchObject({ code });
  expect(complete).not.toHaveBeenCalled();
});

test("paid supplier completion delegates with procurement write access", async () => {
  const guard = serviceAccess("paid");
  const complete = mock(async () => ({ status: "ordered" }));
  await expect(completeSupplier(supplierInput(), { complete }))
    .resolves.toEqual({ status: "ordered" });
  expect(guard).toHaveBeenCalledWith({
    tenantId: "tenant-1", routeAccess: "write", requiredCapability: "business.procurement",
  });
  expect(complete).toHaveBeenCalledTimes(1);
});

test.each(["project", "customer", "expense_request"])("supplier guard leaves %s untouched", async (subject) => {
  const guard = serviceAccess("trial");
  const complete = mock(async () => ({}));
  await expect(completeSupplier(supplierInput(subject), { complete })).resolves.toBeNull();
  expect(guard).not.toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});

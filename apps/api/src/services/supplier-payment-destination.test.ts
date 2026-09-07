import { expect, mock, test } from "bun:test";
import type { AuthContext } from "./authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
const id = "84000000-0000-4000-8000-000000000001";
const warehouseId = "84000000-0000-4000-8000-000000000002";
let warehouseTenant = id;
mock.module("@/repositories/tenant-suppliers", () => ({
  tenantSuppliersRepository: { getSettings: async () => ({ tenant_id: id, module_enabled: true, warehouse_procurement_enabled: false }) },
}));
mock.module("@/repositories/warehouses", () => ({
  warehousesRepository: { findById: async () => ({ id: warehouseId, tenant_id: warehouseTenant, status: "inactive" }) },
}));
mock.module("@/repositories/permissions", () => ({
  permissionRepository: { findProjectTenantById: async () => ({ id, tenant_id: id }) },
}));
const destination = { destination_type: "warehouse" as const, project_id: null, warehouse_id: warehouseId };
const auth = (codes: string[]) => ({ tenantId: id, employeeId: id, authUserId: id, roleCodes: [],
  permissions: codes.map((code) => ({ code, scope: "all" as const })) } as unknown as AuthContext);
const draft = { id, ...destination, expected_version: 0, tenant_supplier_id: id, reason: "结清货款",
  allocations: [{ payable_event_id: id, requested_amount: "10.00" }] };

async function fixture() {
  const { SupplierPaymentRequestsService } = await import("./supplier-payment-requests");
  const { SupplierPaymentAccessService } = await import("./supplier-payment-access");
  const access = new SupplierPaymentAccessService();
  const result = (status: string) => ({ status, payment_request: { id, tenant_id: id, ...destination }, version: 2, idempotent: false });
  const repository = {
    detail: mock(async () => ({ payment_request: { id, tenant_id: id, ...destination }, allocations: [] })),
    list: mock(async (input: unknown) => input), listPayments: mock(async (input: unknown) => input),
    saveDraft: mock(async () => result("saved")), submit: mock(async () => result("submitted")),
    review: mock(async ({ action }: { action: string }) => result(action === "approve" ? "approved" : "rejected")),
    cancel: mock(async () => result("cancelled")), close: mock(async () => result("closed")),
    confirmPayment: mock(async () => result("paid")),
  };
  const fileRepository = { findActiveByObjectKeys: async () => [{ object_key: "proof", tenant_id: id, scene: "expense_request",
    status: "active", deleted_at: null, created_by_employee_id: id }] };
  return { access, repository, service: new SupplierPaymentRequestsService({ access, repository, fileRepository } as never) };
}

test("warehouse settlement reads require financial view plus warehouse view, with no project permission", async () => {
  const { service, repository } = await fixture();
  const codes = ["supplier.payment-request.view", "inventory.warehouse.view"];
  for (const allowed of [[], [codes[0]!], [codes[1]!]]) {
    await expect(service.detail(auth(allowed), id)).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(await service.detail(auth(codes), id)).toMatchObject({ payment_request: destination });
  await service.listPayments(auth(codes), id, { page: 2, pageSize: 20 });
  await service.list(auth(codes), { page: 1, pageSize: 20 });
  expect(repository.list).toHaveBeenCalledWith(expect.objectContaining({ include_warehouse: true, visible_project_ids: [] }));
});

test.each(["save", "submit", "approve", "reject", "cancel", "close", "pay"] as const)(
  "warehouse %s keeps its financial permission and warehouse manage even with operational gate off", async (operation) => {
    const { service } = await fixture();
    const permission = ["approve", "reject"].includes(operation) ? "approve" : operation === "pay" ? "pay" : "manage";
    const run = (context: AuthContext) => {
      if (operation === "save") return service.saveDraft(context, id, draft as never, id);
      if (operation === "pay") return service.confirmPayment(context, id, { id, expected_version: 1, payment_method: "bank_transfer",
        payment_reference: "ref", paid_at: "2026-09-07T00:00:00Z", evidence_images: ["proof"],
        allocations: [{ payment_request_allocation_id: id, payable_event_id: id, amount: "10.00" }] } as never, id);
      return service[operation](context, id, { expected_version: 1, reason: "结清", remark: "结清" }, id);
    };
    for (const codes of [[`supplier.payment-request.${permission}`], ["inventory.warehouse.manage"]]) {
      await expect(run(auth(codes))).rejects.toMatchObject({ statusCode: 403 });
    }
    expect(await run(auth([`supplier.payment-request.${permission}`, "inventory.warehouse.manage"]))).toHaveProperty("status");
  });

test("warehouse tenant identity is checked without using active status as a settlement gate", async () => {
  const { service, repository } = await fixture();
  warehouseTenant = warehouseId;
  try {
    await expect(service.saveDraft(auth(["supplier.payment-request.manage", "inventory.warehouse.manage"]), id, draft as never, id))
      .rejects.toMatchObject({ code: "WAREHOUSE_NOT_FOUND" });
    expect(repository.saveDraft).not.toHaveBeenCalled();
  } finally { warehouseTenant = id; }
});

test.each(["project", "warehouse"] as const)("draft destination changes require both old %s and new destination management", async (oldDestination) => {
  const { service, repository } = await fixture();
  const project = { destination_type: "project" as const, project_id: id, warehouse_id: null };
  repository.detail.mockImplementation(async () => ({ payment_request: {
    id, tenant_id: id, ...(oldDestination === "project" ? project : destination),
  }, allocations: [] }) as never);
  const input = { ...draft, expected_version: 1, ...(oldDestination === "project" ? destination : project) };
  const newPermission = oldDestination === "project" ? "inventory.warehouse.manage" : "project.update";
  await expect(service.saveDraft(auth(["supplier.payment-request.manage", newPermission]), id, input as never, id))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(repository.saveDraft).not.toHaveBeenCalled();
  await service.saveDraft(auth(["supplier.payment-request.manage", "project.update", "inventory.warehouse.manage"]), id, input as never, id);
  expect(repository.saveDraft).toHaveBeenCalledTimes(1);
});

test("payable lists, batches and options retain financial permissions and warehouse scope before pagination", async () => {
  const { SupplierPayablesService } = await import("./supplier-payables");
  const { access } = await fixture();
  const repository = {
    list: mock(async (input: unknown) => input), batch: mock(async (input: unknown) => input),
    listFilterOptions: mock(async (input: unknown) => input),
  };
  const service = new SupplierPayablesService({ access, repository } as never);
  const reader = auth(["supplier.payable.view", "inventory.warehouse.view"]);
  await service.list(reader, { page: 1, pageSize: 20 });
  await service.batch(reader, { ids: [id] });
  await service.listFilterOptions(reader, { type: "warehouse", page: 1, pageSize: 20 });
  for (const method of [repository.list, repository.batch, repository.listFilterOptions]) {
    expect(method).toHaveBeenCalledWith(expect.objectContaining({ include_warehouse: true, visible_project_ids: [] }));
  }
  await expect(service.list(auth(["inventory.warehouse.view"]), { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  await service.requestDraftBatch(auth(["supplier.payment-request.manage", "inventory.warehouse.manage"]), { ids: [id] });
  await expect(service.requestDraftBatch(reader, { ids: [id] })).rejects.toMatchObject({ statusCode: 403 });
  await service.list(auth(["supplier.payable.view", "project.read"]), { page: 1, pageSize: 20 });
  expect(repository.list.mock.calls.at(-1)?.[0]).toMatchObject({ visible_project_ids: null });
  expect(repository.list.mock.calls.at(-1)?.[0]).not.toHaveProperty("include_warehouse");
});

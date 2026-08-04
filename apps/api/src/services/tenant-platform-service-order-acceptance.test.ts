import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  AcceptancePreparationRecord,
  AtomicActionResult,
  OrderRecord,
  WorkOrderRecord,
} from "@/repositories/platform-service-order-records";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "00000000-0000-4000-8000-000000000011";
const employeeId = "00000000-0000-4000-8000-000000000012";
const orderId = "00000000-0000-4000-8000-000000000301";
const now = new Date("2026-08-03T12:00:00.000Z");

const tenantAuth = {
  authUserId: "auth-tenant",
  employeeId,
  tenantId,
  tenantName: "装企",
  tenantSlug: "tenant",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "采购员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["system_admin"],
  roles: [],
  permissions: [
    { code: "billing.service_order.create", scope: "all" },
    { code: "billing.service_order.read", scope: "all" },
  ],
} satisfies AuthContext;

const order = {
  id: orderId,
  tenant_id: tenantId,
  order_no: "TSO202608030001",
  out_trade_no: "TSO202608030001",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 980000,
  payment_status: "paid",
  service_status: "awaiting_acceptance",
  prepay_id: "prepay-existing",
  payment_expires_at: "2026-08-03T12:05:00.000Z",
  paid_at: "2026-08-03T12:10:00.000Z",
  closed_at: null,
  terms_version: 1,
  version: 4,
  created_at: "2026-08-03T12:00:00.000Z",
  updated_at: "2026-08-03T12:40:00.000Z",
} satisfies OrderRecord;

const workOrder = {
  id: "00000000-0000-4000-8000-000000000501",
  tenant_id: tenantId,
  service_order_id: orderId,
  order_no: "TSO202608030001",
  status: "awaiting_acceptance",
  assignee_employee_id: "00000000-0000-4000-8000-000000000099",
  created_by_employee_id: employeeId,
  assigned_at: "2026-08-03T12:20:00.000Z",
  version: 5,
  created_at: "2026-08-03T12:10:00.000Z",
  updated_at: "2026-08-03T12:40:00.000Z",
} satisfies WorkOrderRecord;

const acceptancePreparation = {
  id: "00000000-0000-4000-8000-000000000601",
  tenant_id: tenantId,
  service_order_id: orderId,
  work_order_id: workOrder.id,
  status: "submitted",
  summary: "客户专属系统已完成部署、服务器配置和首次培训。",
  prepared_by_employee_id: employeeId,
  prepared_at: "2026-08-03T12:30:00.000Z",
  submitted_at: "2026-08-03T12:40:00.000Z",
  created_at: "2026-08-03T12:30:00.000Z",
  updated_at: "2026-08-03T12:40:00.000Z",
} satisfies AcceptancePreparationRecord;

const acceptanceView = {
  ...order,
  work_orders: [workOrder],
  acceptance_preparations: [acceptancePreparation],
  fulfillment_records: [{
    id: "00000000-0000-4000-8000-000000000701",
    tenant_id: tenantId,
    service_order_id: orderId,
    work_order_id: workOrder.id,
    record_type: "server_configuration",
    title: "服务器配置",
    content: "已完成服务器基础配置与安全基线配置。",
    occurred_at: "2026-08-03T12:35:00.000Z",
    created_by_employee_id: employeeId,
    created_at: "2026-08-03T12:35:00.000Z",
    updated_at: "2026-08-03T12:35:00.000Z",
    attachments: [{
      id: "00000000-0000-4000-8000-000000000801",
      file_id: "00000000-0000-4000-8000-000000000901",
      file_name: "交付说明.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      created_at: "2026-08-03T12:36:00.000Z",
    }],
  }],
};

function createDependencies() {
  return {
    repository: {
      findAcceptanceViewByTenantAndOrderId: mock(async () => acceptanceView),
      decideAcceptance: mock(async (input: {
        decision: "accepted" | "rejected";
      }): Promise<AtomicActionResult> => ({
        workOrder: {
          ...workOrder,
          status: input.decision === "accepted" ? "accepted" : "rectifying",
          version: 6,
        },
        order: {
          ...order,
          service_status: input.decision === "accepted" ? "accepted" : "rectifying",
          version: 5,
        },
        acceptancePreparation: {
          ...acceptancePreparation,
          status: input.decision,
        },
      })),
    },
    accessPolicyService: {
      assertTenantContext: mock(() => tenantId),
      hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
        authContext.permissions.some((permission) =>
          permission.code === permissionCode
        )
      ),
    },
    nowFactory: () => now,
  };
}

describe("Tenant platform service order acceptance", () => {
  let dependencies: ReturnType<typeof createDependencies>;

  beforeEach(() => {
    dependencies = createDependencies();
  });

  test("returns customer acceptance view for a tenant service order", async () => {
    const { getTenantServiceOrderAcceptance } = await import(
      "./tenant-platform-service-order-acceptance"
    );

    const result = await getTenantServiceOrderAcceptance(
      dependencies,
      tenantAuth,
      orderId,
    );

    expect(
      dependencies.repository.findAcceptanceViewByTenantAndOrderId,
    ).toHaveBeenCalledWith({ tenantId, orderId });
    expect(result.order).toMatchObject({
      id: orderId,
      payment_status: "paid",
      service_status: "awaiting_acceptance",
    });
    expect(result.work_order).toMatchObject({
      status: "awaiting_acceptance",
      version: 5,
    });
    expect(result.acceptance_preparation).toMatchObject({
      status: "submitted",
      summary: "客户专属系统已完成部署、服务器配置和首次培训。",
    });
    expect(result.fulfillment_records[0]).toMatchObject({
      record_type: "server_configuration",
      attachments: [{ file_id: "00000000-0000-4000-8000-000000000901" }],
    });
    expect(result.available_actions.accept).toMatchObject({ enabled: true });
    expect(result.available_actions.reject).toMatchObject({ enabled: true });
  });

  test("confirms customer acceptance through the atomic repository decision", async () => {
    const { decideTenantServiceOrderAcceptance } = await import(
      "./tenant-platform-service-order-acceptance"
    );

    const result = await decideTenantServiceOrderAcceptance(
      dependencies,
      tenantAuth,
      orderId,
      {
        expected_work_order_version: 5,
        remark: "确认验收通过",
      },
      "accepted",
    );

    expect(dependencies.repository.decideAcceptance).toHaveBeenCalledWith({
      tenantId,
      serviceOrderId: orderId,
      decision: "accepted",
      expectedWorkOrderVersion: 5,
      operatorEmployeeId: employeeId,
      remark: "确认验收通过",
    });
    expect(result.work_order).toMatchObject({ status: "accepted", version: 6 });
    expect(result.acceptance_preparation).toMatchObject({ status: "accepted" });
  });

  test("rejects customer acceptance and sends the work order back to rectifying", async () => {
    const { decideTenantServiceOrderAcceptance } = await import(
      "./tenant-platform-service-order-acceptance"
    );

    const result = await decideTenantServiceOrderAcceptance(
      dependencies,
      tenantAuth,
      orderId,
      {
        expected_work_order_version: 5,
        remark: "培训资料缺少管理员操作说明",
      },
      "rejected",
    );

    expect(dependencies.repository.decideAcceptance).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        serviceOrderId: orderId,
        decision: "rejected",
        expectedWorkOrderVersion: 5,
      }),
    );
    expect(result.work_order).toMatchObject({ status: "rectifying", version: 6 });
    expect(result.acceptance_preparation).toMatchObject({ status: "rejected" });
  });

  test("maps stale customer acceptance decisions to a stable conflict code", async () => {
    dependencies.repository.decideAcceptance.mockImplementationOnce(async () => ({
      workOrder: null,
      order: null,
      acceptancePreparation: null,
      errorCode: "SERVICE_WORK_ORDER_VERSION_CONFLICT",
    }));
    const { decideTenantServiceOrderAcceptance } = await import(
      "./tenant-platform-service-order-acceptance"
    );

    await expect(decideTenantServiceOrderAcceptance(
      dependencies,
      tenantAuth,
      orderId,
      { expected_work_order_version: 4 },
      "accepted",
    )).rejects.toMatchObject({
      code: "SERVICE_WORK_ORDER_VERSION_CONFLICT",
    });
  });
});

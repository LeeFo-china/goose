import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const authContext = {
  authUserId: "platform-user",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  employeeId: "admin-1",
  isPlatformAdmin: true,
  employeeName: "平台管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.service_work_order.manage", scope: "all" }],
} satisfies AuthContext;

const order = {
  id: "order-1",
  tenant_id: "tenant-1",
  order_no: "TSO1",
  product_code: "platform_service_1y",
  term_years: 1,
  amount_fen: 100,
  payment_status: "paid",
  service_status: "accepted",
  prepay_id: null,
  payment_expires_at: "2026-08-04T10:05:00.000Z",
  paid_at: "2026-08-04T10:01:00.000Z",
  closed_at: null,
  terms_version: 1,
  version: 2,
  created_at: "2026-08-04T10:00:00.000Z",
  updated_at: "2026-08-08T10:00:00.000Z",
};
const workOrder = {
  id: "work-1",
  tenant_id: "tenant-1",
  service_order_id: "order-1",
  order_no: "TSO1",
  status: "accepted",
  assignee_employee_id: "admin-1",
  created_by_employee_id: "admin-1",
  version: 2,
  created_at: "2026-08-04T10:01:00.000Z",
  updated_at: "2026-08-08T10:00:00.000Z",
};

describe("PlatformServiceFulfillmentService overdue acceptance", () => {
  test("returns the same formal contract-period facts and idempotency marker", async () => {
    const repository = {
      confirmOverdueAcceptance: mock(async () => ({
        workOrder,
        order,
        acceptancePreparation: {
          id: "acceptance-1",
          tenant_id: "tenant-1",
          service_order_id: "order-1",
          work_order_id: "work-1",
          status: "accepted",
          summary: "部署完成",
          prepared_by_employee_id: "admin-1",
          prepared_at: "2026-08-04T10:00:00.000Z",
          submitted_at: "2026-08-04T10:00:00.000Z",
          acceptance_due_at: "2026-08-07T10:00:00.000Z",
          created_at: "2026-08-04T10:00:00.000Z",
          updated_at: "2026-08-08T10:00:00.000Z",
        },
        contract: {
          id: "contract-1",
          tenant_id: "tenant-1",
          status: "active",
          service_start_at: "2026-08-08T10:00:00.000Z",
          service_end_at: "2027-08-08T10:00:00.000Z",
        },
        contractPeriod: {
          id: "period-1",
          contract_id: "contract-1",
          tenant_id: "tenant-1",
          service_order_id: "order-1",
          status: "active",
          starts_at: "2026-08-08T10:00:00.000Z",
          ends_at: "2027-08-08T10:00:00.000Z",
        },
        idempotent: true,
      })),
    };
    const orderShippingReporter = {
      reportAcceptedOrder: mock(async () => ({
        status: "succeeded" as const,
        idempotent: true,
        report: null,
        error_code: null,
        skipped_reason: null,
      })),
    };
    const { PlatformServiceFulfillmentService } = await import(
      "./platform-service-fulfillment"
    );
    const service = new PlatformServiceFulfillmentService({
      repository: repository as never,
      orderShippingReporter,
      nowFactory: () => new Date("2026-08-08T10:00:00.000Z"),
    });

    const result = await service.confirmOverdueAcceptance(
      authContext,
      "work-1",
      { expected_version: 1, remark: "客户逾期未确认", metadata: {} },
    );

    expect(result).toMatchObject({
      contract: { id: "contract-1" },
      contract_period: { id: "period-1" },
      idempotent: true,
    });
  });
});

import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const createPayment = mock(async (input: Record<string, unknown>) => ({
  id: "payment-1",
  ...input,
}));
const updatePayment = mock(async (id: string, input: Record<string, unknown>) => ({
  id,
  project_id: "550e8400-e29b-41d4-a716-446655440001",
  ...input,
}));
const findById = mock(async () => ({
  id: "payment-1",
  project_id: "550e8400-e29b-41d4-a716-446655440001",
  amount: 100,
  type: "deposit",
  status: "pending",
  created_at: "2026-06-16T00:00:00.000Z",
}));

mock.module("@/repositories/payments", () => ({
  paymentRepository: {
    create: createPayment,
    update: updatePayment,
    findById,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    canAccessProject: mock(async () => true),
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((permission) =>
        permission.code === permissionCode
      )?.scope ?? null
    ),
  },
}));

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

describe("paymentService", () => {
  test("normalizes paid_at to pay_date before creating a payment", async () => {
    const { paymentService } = await import("./payments");

    await paymentService.createPayment(authContext, {
      project_id: "550e8400-e29b-41d4-a716-446655440001",
      amount: 100,
      type: "deposit",
      status: "confirmed",
      payment_channel: "manual",
      paid_at: "2026-06-16T10:00:00.000Z",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        pay_date: "2026-06-16T10:00:00.000Z",
      }),
    );
    expect(createPayment.mock.calls[0]?.[0]).not.toHaveProperty("paid_at");
  });

  test("normalizes paid_at to pay_date before updating a payment", async () => {
    const { paymentService } = await import("./payments");

    await paymentService.updatePayment(authContext, "payment-1", {
      paid_at: "2026-06-16T11:00:00.000Z",
    });

    expect(updatePayment).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({
        pay_date: "2026-06-16T11:00:00.000Z",
      }),
    );
    expect(updatePayment.mock.calls[0]?.[1]).not.toHaveProperty("paid_at");
  });
});

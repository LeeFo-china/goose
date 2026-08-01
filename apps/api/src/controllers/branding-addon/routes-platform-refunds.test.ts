import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH = {
  authUserId: "11111111-1111-4111-8111-111111111111",
  employeeId: "22222222-2222-4222-8222-222222222222",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
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
  permissions: [{
    code: "platform.branding_virtual_refund.manage",
    scope: "all" as const,
  }],
} satisfies AuthContext;
const REFUND_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "44444444-4444-4444-8444-444444444444";

describe("BrandingAddonController platform refund routes", () => {
  test("注册创建、分页列表和详情接口并委托退款服务", async () => {
    const { default: controller } = await import(".");
    const { authorizationService } = await import("@/services/authorization");
    const { brandingVirtualRefundService } = await import(
      "@/services/branding-virtual-refunds"
    );
    const originalAuth = authorizationService.getRequiredAuthContext;
    const originals = {
      create: brandingVirtualRefundService.create,
      list: brandingVirtualRefundService.list,
      get: brandingVirtualRefundService.get,
    };
    const create = mock(async () => ({ id: REFUND_ID }));
    const list = mock(async () => ({ list: [] }));
    const get = mock(async () => ({ id: REFUND_ID }));
    authorizationService.getRequiredAuthContext = mock(async () => AUTH);
    Reflect.set(brandingVirtualRefundService, "create", create);
    Reflect.set(brandingVirtualRefundService, "list", list);
    Reflect.set(brandingVirtualRefundService, "get", get);

    try {
      const routes = captureRoutes(controller);
      await routes.get("POST /platform/branding/virtual-payment/refunds")?.({
        body: {
          order_id: ORDER_ID,
          idempotency_key: "55555555-5555-4555-8555-555555555555",
          reason: "用户申请退款",
          evidence_summary: "工单已核验",
        },
        query: {},
      } as FastifyRequest, {});
      await routes.get("GET /platform/branding/virtual-payment/refunds")?.({
        query: { page: "2", pageSize: "100", status: "submitted" },
      } as unknown as FastifyRequest, {});
      await routes.get("GET /platform/branding/virtual-payment/refunds/:id")?.({
        params: { id: REFUND_ID },
        query: {},
      } as FastifyRequest, {});

      expect(create).toHaveBeenCalledWith(AUTH, expect.objectContaining({
        order_id: ORDER_ID,
      }));
      expect(list).toHaveBeenCalledWith(AUTH, {
        page: 2,
        pageSize: 100,
        status: "submitted",
      });
      expect(get).toHaveBeenCalledWith(AUTH, REFUND_ID);
    } finally {
      authorizationService.getRequiredAuthContext = originalAuth;
      for (const [key, value] of Object.entries(originals)) {
        Reflect.set(brandingVirtualRefundService, key, value);
      }
    }
  });
});

type Handler = (request: FastifyRequest, reply: unknown) => Promise<unknown>;

function captureRoutes(controller: { registerExtraRoutes(app: unknown): void }) {
  const routes = new Map<string, Handler>();
  const register = (method: string) => (path: string, handler: Handler) => {
    routes.set(`${method} ${path}`, handler);
  };
  controller.registerExtraRoutes({
    get: register("GET"),
    post: register("POST"),
    patch: register("PATCH"),
  });
  return routes;
}

import { describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const OPENID = "wx-platform-admin-openid";

function registeredPostHandler(controller: {
  registerExtraRoutes(fastify: unknown): void;
}) {
  let route = "";
  let handler: ((request: FastifyRequest, reply: unknown) => Promise<unknown>) | undefined;
  controller.registerExtraRoutes({
    post(path: string, optionsOrHandler: unknown, maybeHandler?: typeof handler) {
      route = path;
      handler = maybeHandler ?? optionsOrHandler as typeof handler;
    },
  });
  if (!handler) throw new TypeError("missing POST handler");
  return { route, handler };
}

describe("PlatformAuthController", () => {
  test("registers the platform WeChat unbind route", async () => {
    const { PlatformAuthController } = await import(".");
    const { route } = registeredPostHandler(
      new PlatformAuthController({ unbindWechat: mock() } as never),
    );
    expect(route).toBe("/platform/auth/unbind-wechat");
  });

  test("requires a live super-admin context and delegates current token identity", async () => {
    const { PlatformAuthController } = await import(".");
    const unbindWechat = mock(async () => ({
      success: true,
      message: "微信绑定已解除",
    }));
    const controller = new PlatformAuthController({ unbindWechat } as never);
    const getRequiredPlatformSuperAdminContext = mock(async () => ({
      authUserId: AUTH_USER_ID,
      employeeId: EMPLOYEE_ID,
    }));
    Reflect.set(
      controller,
      "getRequiredPlatformSuperAdminContext",
      getRequiredPlatformSuperAdminContext,
    );
    const { handler } = registeredPostHandler(controller);
    const request = {
      user: {
        sub: AUTH_USER_ID,
        employee_id: EMPLOYEE_ID,
        openid: OPENID,
        admin_auth_version: 3,
      },
    } as FastifyRequest;

    await expect(handler(request, {})).resolves.toEqual({
      data: { success: true, message: "微信绑定已解除" },
      message: "success",
    });
    expect(getRequiredPlatformSuperAdminContext).toHaveBeenCalledWith(request);
    expect(unbindWechat).toHaveBeenCalledWith({
      authUserId: AUTH_USER_ID,
      employeeId: EMPLOYEE_ID,
      openid: OPENID,
    });
  });
});

import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller: typeof import(".").VisitorRenderingsController;

beforeAll(async () => {
  ({ VisitorRenderingsController: Controller } = await import("."));
});

describe("VisitorRenderingsController", () => {
  test("registers exactly the WeChat quota routes as session surfaces", () => {
    const controller = new Controller({ getQuota: mock(), bindPhone: mock() } as never);
    const routes: Array<{ method: string; path: string; access: string }> = [];
    const capture = (method: string) => (
      path: string,
      options: { config: { tenantServiceAccess: string } },
    ) => routes.push({ method, path, access: options.config.tenantServiceAccess });

    controller.registerExtraRoutes({
      get: capture("GET"),
      post: capture("POST"),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/visitor/renderings/quota", access: "session" },
      { method: "POST", path: "/visitor/renderings/phone:bind", access: "session" },
    ]);
  });

  test("passes only the signed user and strict command to the shared service", async () => {
    const quota = {
      trial_used: false,
      phone_verified: false,
      consumed: 0,
      reserved: 0,
      remaining: 1,
      active_job_id: null,
      can_generate: true,
      blocked_reason: null,
    } as const;
    const boundQuota = { ...quota, phone_verified: true, remaining: 5 } as const;
    const getQuota = mock(async () => quota);
    const bindPhone = mock(async () => boundQuota);
    const controller = new Controller({ getQuota, bindPhone } as never);
    const user = { token_type: "visitor_session", openid: "openid", visitor_id: "visitor" };
    const command = { idempotency_key: "11111111-1111-4111-8111-111111111111" };

    await expect(controller.getQuota({ user } as never)).resolves.toEqual({
      data: quota,
      message: "success",
    });
    await expect(controller.bindPhone({ user, body: command } as never)).resolves.toEqual({
      data: boundQuota,
      message: "success",
    });
    expect(getQuota).toHaveBeenCalledWith(user, "wechat");
    expect(bindPhone).toHaveBeenCalledWith(user, "wechat", command);

    await expect(controller.bindPhone({ user, body: { ...command, phone: "13800000000" } } as never))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(bindPhone).toHaveBeenCalledTimes(1);
  });
});

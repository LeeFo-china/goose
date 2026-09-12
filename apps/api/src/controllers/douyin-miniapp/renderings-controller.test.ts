import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller: typeof import("./renderings-controller").DouyinRenderingsController;

beforeAll(async () => {
  ({ DouyinRenderingsController: Controller } = await import("./renderings-controller"));
});

describe("DouyinRenderingsController", () => {
  test("registers exact session-only quota routes", () => {
    const controller = new Controller({ getQuota: mock(), bindPhone: mock() } as never);
    const routes: Array<{ method: string; path: string; access: string }> = [];
    const capture = (method: string) => (
      path: string,
      options: { config: { tenantServiceAccess: string } },
    ) => routes.push({ method, path, access: options.config.tenantServiceAccess });
    controller.registerExtraRoutes({ get: capture("GET"), post: capture("POST") } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/douyin-mini/renderings/quota", access: "session" },
      { method: "POST", path: "/douyin-mini/renderings/phone:bind", access: "session" },
    ]);
  });

  test("dispatches only trusted request state and rejects body authority", async () => {
    const getQuota = mock(async () => ({ remaining: 1 }));
    const bindPhone = mock(async () => ({ remaining: 5 }));
    const controller = new Controller({ getQuota, bindPhone } as never);
    const user = { token_type: "douyin_miniapp", subject_hash: "a".repeat(64) };
    const command = { idempotency_key: "11111111-1111-4111-8111-111111111111" };

    await controller.getQuota({ user } as never);
    await controller.bindPhone({ user, body: command } as never);
    expect(getQuota).toHaveBeenCalledWith(user, "douyin");
    expect(bindPhone).toHaveBeenCalledWith(user, "douyin", command);

    await expect(controller.bindPhone({ user, body: { ...command, tenant_id:
      "22222222-2222-4222-8222-222222222222" } } as never))
      .rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(bindPhone).toHaveBeenCalledTimes(1);
  });
});

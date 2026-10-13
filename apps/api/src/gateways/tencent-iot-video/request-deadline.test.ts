import { afterEach, expect, mock, spyOn, test } from "bun:test";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
afterEach(() => mock.restore());
test("abort bounds blocked config reads and late config cannot dispatch a vendor request", async () => {
  const { request } = await import("./request");
  const { systemSettingsService } = await import("./shared");
  let release!: (secret: string) => void;
  const secret = new Promise<string>((resolve) => { release = resolve; });
  spyOn(systemSettingsService, "getSecretString").mockImplementation(() => secret);
  spyOn(systemSettingsService, "getString").mockImplementation(async (_key, fallback) => fallback || "test");
  const fetch = spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ Response: {} })));
  const controller = new AbortController();
  const { Errors } = await import("@/errors/error-factory");
  const failure = Errors.business(504, "状态刷新超时", "CAMERA_STATUS_TIMEOUT");
  const pending = request("DescribeChannels", { DeviceId: "d" }, { signal: controller.signal })
    .then(() => "fulfilled", () => "aborted");
  controller.abort(failure);
  const result = await Promise.race([pending, Bun.sleep(80).then(() => "blocked")]);
  release("test-secret");
  await Bun.sleep(5);
  expect(result).toBe("aborted");
  expect(fetch).not.toHaveBeenCalled();
});

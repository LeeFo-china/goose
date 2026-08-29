import { expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

test("does not expose non-atomic tenant creation", async () => {
  const [{ platformTenantRepository }, tenantFunctions] = await Promise.all([
    import("./legacy-repository"),
    import("./legacy/tenants"),
  ]);

  expect({
    repository: "create" in platformTenantRepository,
    tenantModule: "create" in tenantFunctions,
  }).toEqual({
    repository: false,
    tenantModule: false,
  });
});

test("adapts a bound Supabase RPC thenable to the command Promise boundary", async () => {
  const response = {
    data: { tenant_id: "tenant-1" },
    error: null,
    count: 1,
  };
  const resolved = Promise.resolve(response);
  const builder: PromiseLike<typeof response> = {
    then: resolved.then.bind(resolved),
  };
  const calls: Array<[string, Record<string, unknown>]> = [];
  let receiver: unknown;
  const client = {
    rpc(functionName: string, args: Record<string, unknown>) {
      receiver = this;
      calls.push([functionName, args]);
      return builder;
    },
  };
  const { createPlatformTenantRpcAdapter } = await import(
    "./legacy-repository"
  );

  const rpc = createPlatformTenantRpcAdapter(client);
  const resultPromise = rpc("create_tenant_with_default_template", {
    p_name: "晴天装饰",
  });

  expect(builder).not.toBeInstanceOf(Promise);
  expect(resultPromise).toBeInstanceOf(Promise);
  expect(await resultPromise).toEqual({
    data: response.data,
    error: null,
  });
  expect(receiver).toBe(client);
  expect(calls).toEqual([[
    "create_tenant_with_default_template",
    { p_name: "晴天装饰" },
  ]]);
});

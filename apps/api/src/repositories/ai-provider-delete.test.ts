import { expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ID = "11111111-1111-4111-8111-111111111111";
const SYNTHETIC = "synthetic-private-database-detail";

async function repository(response: { data: unknown; error: unknown }) {
  const { AiConfigRepository } = await import("./ai-config");
  const calls: Array<[string, ...unknown[]]> = [];
  const builder = {
    delete: () => { calls.push(["delete"]); return builder; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return builder; },
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return builder; },
    maybeSingle: async () => { calls.push(["maybeSingle"]); return response; },
  };
  return {
    calls,
    repository: new AiConfigRepository({ from: (table) => { calls.push(["from", table]); return builder; } }),
  };
}

test("deletes atomically by provider ID and version and returns only audit identity", async () => {
  const fixture = await repository({ data: { id: ID, name: "Test provider" }, error: null });
  expect(await fixture.repository.deleteProvider(ID, { expected_version: 3 })).toEqual({ id: ID, name: "Test provider" });
  expect(fixture.calls).toEqual([
    ["from", "ai_providers"], ["delete"], ["eq", "id", ID], ["eq", "version", 3],
    ["select", "id,name"], ["maybeSingle"],
  ]);
});

test("maps all referencing FK failures to fixed in-use conflict without database details", async () => {
  const fixture = await repository({ data: null, error: { code: "23503", message: SYNTHETIC, details: SYNTHETIC, hint: SYNTHETIC } });
  await expect(fixture.repository.deleteProvider(ID, { expected_version: 3 })).rejects.toMatchObject({
    statusCode: 409, code: "AI_PROVIDER_IN_USE", message: "供应商仍有关联模型或目录记录，请改用停用", details: undefined,
  });
});

test("stale version and already-deleted provider share a fixed conflict", async () => {
  for (const error of [null, { code: "PGRST116", message: SYNTHETIC, details: "The result contains 0 rows" }]) {
    const fixture = await repository({ data: null, error });
    await expect(fixture.repository.deleteProvider(ID, { expected_version: 3 })).rejects.toMatchObject({
      statusCode: 409, code: "AI_CONFIG_VERSION_STALE", details: undefined,
    });
  }
});

test("unexpected database failures are wrapped without raw details", async () => {
  const fixture = await repository({ data: null, error: { code: "XX000", message: SYNTHETIC, details: SYNTHETIC } });
  await expect(fixture.repository.deleteProvider(ID, { expected_version: 3 })).rejects.toMatchObject({
    statusCode: 500, code: "DB_ERROR", message: "删除 AI 供应商失败", details: undefined,
  });
});

import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

function updateBuilder(error: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder = {
    update: (...args: unknown[]) => { calls.push({ method: "update", args }); return builder; },
    eq: (...args: unknown[]) => { calls.push({ method: "eq", args }); return builder; },
    select: (...args: unknown[]) => { calls.push({ method: "select", args }); return builder; },
    single: async () => ({ data: null, error }),
    calls,
  };
  return builder;
}

describe("AiConfigRepository optimistic version errors", () => {
  test("maps stale version updates to stable 409 without raw database details", async () => {
    const { AiConfigRepository } = await import("./ai-config");
    const builder = updateBuilder({
      code: "PGRST116",
      message: "JSON object requested, multiple (or no) rows returned",
      details: "The result contains 0 rows",
    });
    const repository = new AiConfigRepository({
      from: () => builder,
    } as never);

    await expect(repository.updateModel("11111111-1111-4111-8111-111111111111", {
      expected_version: 3,
      name: "新模型",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "AI_CONFIG_VERSION_STALE",
      details: undefined,
    });
    expect(builder.calls).toContainEqual({ method: "eq", args: ["version", 3] });
  });
});

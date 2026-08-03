import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinMiniappSessionsRepository:
  typeof import("./douyin-miniapp-sessions").DouyinMiniappSessionsRepository;

beforeAll(async () => {
  ({ DouyinMiniappSessionsRepository } = await import("./douyin-miniapp-sessions"));
});

describe("DouyinMiniappSessionsRepository", () => {
  test("selects one installation by AppID with only session-bound fields", async () => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const row = {
      id: "22222222-2222-4222-8222-222222222222",
      tenant_id: "33333333-3333-4333-8333-333333333333",
      authorizer_appid: "tt-authorizer-1",
      deployment_key: "deployment-public-key",
      installation_kind: "merchant" as const,
      authorization_status: "active" as const,
      template_version: "1.0.0",
      tenant: {
        id: "33333333-3333-4333-8333-333333333333",
        status: "active" as const,
      },
    };
    const query = {
      select(columns: string) { calls.push({ method: "select", args: [columns] }); return query; },
      eq(column: string, value: unknown) {
        calls.push({ method: "eq", args: [column, value] }); return query;
      },
      maybeSingle: mock(async () => ({ data: row, error: null })),
    };
    const client = { from: mock((table: string) => {
      calls.push({ method: "from", args: [table] }); return query;
    }) };

    await expect(new DouyinMiniappSessionsRepository(client as never)
      .findByAppId("tt-authorizer-1")).resolves.toEqual(row);

    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).toContain("deployment_key");
    expect(select).toContain("tenant:tenants(id,status)");
    expect(select).not.toMatch(/\*|access_token|refresh_token|ciphertext|claim|runtime_config/);
    expect(calls).toContainEqual({ method: "eq", args: [
      "authorizer_appid", "tt-authorizer-1",
    ] });
  });
});

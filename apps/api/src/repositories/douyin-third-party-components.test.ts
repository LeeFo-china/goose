import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  DouyinComponentDatabaseClient,
  DouyinComponentDatabaseResult,
  DouyinComponentQuery,
} from "./douyin-third-party-components";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinThirdPartyComponentsRepository:
  typeof import("./douyin-third-party-components").DouyinThirdPartyComponentsRepository;

beforeAll(async () => {
  ({ DouyinThirdPartyComponentsRepository } = await import("./douyin-third-party-components"));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: DouyinComponentDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements DouyinComponentQuery {
    select(columns: string) { calls.push({ method: "select", args: [columns] }); return this; }
    eq(column: string, value: unknown) { calls.push({ method: "eq", args: [column, value] }); return this; }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }
  }
  const client: DouyinComponentDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
    rpc: mock((name: string, args: Record<string, unknown>) => {
      calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }),
  };
  return { client, calls };
}

const componentRow = {
  component_appid: "component-appid",
  component_ticket_ciphertext: "ticket-ciphertext",
  component_ticket_iv: "ticket-iv",
  component_ticket_tag: "ticket-tag",
  component_ticket_key_version: "v1",
  component_ticket_received_at: "2026-07-20T00:00:00.000Z",
  access_token_ciphertext: "access-ciphertext",
  access_token_iv: "access-iv",
  access_token_tag: "access-tag",
  access_token_key_version: "v1",
  access_token_expires_at: "2026-07-20T01:00:00.000Z",
  token_refresh_claim_token: null,
  token_refresh_claim_expires_at: null,
};

describe("DouyinThirdPartyComponentsRepository", () => {
  test("selects only named credential and lease fields from an active component", async () => {
    const { client, calls } = createClient([{ data: componentRow, error: null }]);
    const repository = new DouyinThirdPartyComponentsRepository(client);

    await expect(repository.findActive("component-appid")).resolves.toEqual(componentRow);

    expect(calls).toContainEqual({ method: "from", args: ["douyin_third_party_components"] });
    expect(calls).toContainEqual({ method: "eq", args: ["component_appid", "component-appid"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    const selected = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(selected).toBe(
      "component_appid,component_ticket_ciphertext,component_ticket_iv,component_ticket_tag,component_ticket_key_version,component_ticket_received_at,access_token_ciphertext,access_token_iv,access_token_tag,access_token_key_version,access_token_expires_at,token_refresh_claim_token,token_refresh_claim_expires_at",
    );
    expect(selected).not.toContain("*");
  });

  test("claims through the RPC and validates a zero-or-one row result", async () => {
    const lease = { claim_token: "11111111-1111-4111-8111-111111111111", claim_expires_at: "2026-07-20T00:00:30.000Z" };
    const success = createClient([{ data: [lease], error: null }]);
    const repository = new DouyinThirdPartyComponentsRepository(success.client);

    await expect(repository.claimAccessTokenRefresh("component-appid")).resolves.toEqual({
      claimToken: lease.claim_token,
      claimExpiresAt: lease.claim_expires_at,
    });
    expect(success.calls).toContainEqual({
      method: "rpc",
      args: ["claim_douyin_component_token_refresh", { p_component_appid: "component-appid" }],
    });

    const invalid = createClient([{ data: [lease, lease], error: null }]);
    await expect(new DouyinThirdPartyComponentsRepository(invalid.client)
      .claimAccessTokenRefresh("component-appid"))
      .rejects.toMatchObject({ code: "DOUYIN_COMPONENT_REPOSITORY_RESPONSE_INVALID" });
  });

  test("completes and fails only the matching lease through exact RPC arguments", async () => {
    const { client, calls } = createClient([
      { data: true, error: null },
      { data: false, error: null },
    ]);
    const repository = new DouyinThirdPartyComponentsRepository(client);

    await expect(repository.completeAccessTokenRefresh({
      componentAppId: "component-appid",
      claimToken: "11111111-1111-4111-8111-111111111111",
      accessToken: {
        ciphertext: "ciphertext", iv: "iv", tag: "tag", keyVersion: "v1",
        expiresAt: "2026-07-20T02:00:00.000Z",
      },
    })).resolves.toBe(true);
    await expect(repository.failAccessTokenRefresh({
      componentAppId: "component-appid",
      claimToken: "11111111-1111-4111-8111-111111111111",
      errorCode: "DOUYIN_COMPONENT_TOKEN_REFRESH_FAILED",
    })).resolves.toBe(false);

    expect(calls.filter((call) => call.method === "rpc")).toEqual([
      {
        method: "rpc",
        args: ["complete_douyin_component_token_refresh", {
          p_component_appid: "component-appid",
          p_claim_token: "11111111-1111-4111-8111-111111111111",
          p_access_token_ciphertext: "ciphertext",
          p_access_token_iv: "iv",
          p_access_token_tag: "tag",
          p_access_token_key_version: "v1",
          p_access_token_expires_at: "2026-07-20T02:00:00.000Z",
        }],
      },
      {
        method: "rpc",
        args: ["fail_douyin_component_token_refresh", {
          p_component_appid: "component-appid",
          p_claim_token: "11111111-1111-4111-8111-111111111111",
          p_last_refresh_error_code: "DOUYIN_COMPONENT_TOKEN_REFRESH_FAILED",
        }],
      },
    ]);
  });

  test("wraps raw database failures without exposing their payload", async () => {
    const { client } = createClient([{
      data: null,
      error: { message: "database leaked ticket-ciphertext" },
    }]);
    let caught: unknown;
    try {
      await new DouyinThirdPartyComponentsRepository(client).findActive("component-appid");
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "DOUYIN_COMPONENT_REPOSITORY_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("ticket-ciphertext");
  });

  test("wraps rejected database operations without exposing their exception", async () => {
    const query: DouyinComponentQuery = {
      select: () => query,
      eq: () => query,
      maybeSingle: async () => { throw new TypeError("network leaked ticket-ciphertext"); },
    };
    const client: DouyinComponentDatabaseClient = {
      from: () => query,
      rpc: async () => ({ data: null, error: null }),
    };
    let caught: unknown;
    try {
      await new DouyinThirdPartyComponentsRepository(client).findActive("component-appid");
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "DOUYIN_COMPONENT_REPOSITORY_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("ticket-ciphertext");
  });
});

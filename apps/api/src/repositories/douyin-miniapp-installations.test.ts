import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  AuthorizerRefreshRotation,
  DouyinInstallationDatabaseClient,
  DouyinInstallationDatabaseResult,
  DouyinInstallationQuery,
} from "./douyin-miniapp-installations";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let DouyinMiniappInstallationsRepository:
  typeof import("./douyin-miniapp-installations").DouyinMiniappInstallationsRepository;

beforeAll(async () => {
  ({ DouyinMiniappInstallationsRepository } = await import("./douyin-miniapp-installations"));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: DouyinInstallationDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements DouyinInstallationQuery {
    private chain(method: string, args: readonly unknown[]) { calls.push({ method, args }); return this; }
    select(columns: string) { return this.chain("select", [columns]); }
    update(value: unknown) { return this.chain("update", [value]); }
    eq(column: string, value: unknown) { return this.chain("eq", [column, value]); }
    in(column: string, values: readonly string[]) { return this.chain("in", [column, values]); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }
  }
  const client: DouyinInstallationDatabaseClient = {
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

const installationRow = {
  id: "22222222-2222-4222-8222-222222222222",
  tenant_id: "33333333-3333-4333-8333-333333333333",
  component_appid: "component-appid",
  authorizer_appid: "authorizer-appid",
  deployment_key: "merchant-a",
  installation_kind: "merchant",
  authorization_status: "active",
  access_token_ciphertext: "access-ciphertext",
  access_token_iv: "access-iv",
  access_token_tag: "access-tag",
  access_token_key_version: "v1",
  access_token_expires_at: "2026-07-20T01:00:00.000Z",
  refresh_token_ciphertext: "refresh-ciphertext",
  refresh_token_iv: "refresh-iv",
  refresh_token_tag: "refresh-tag",
  refresh_token_key_version: "v1",
  refresh_token_expires_at: "2026-08-20T00:00:00.000Z",
  permission_snapshot: [],
  token_refresh_claim_token: null,
  token_refresh_claim_expires_at: null,
};

describe("DouyinMiniappInstallationsRepository lookups", () => {
  test("active lookup always filters the authorizer appid and selects named fields", async () => {
    const { client, calls } = createClient([{ data: installationRow, error: null }]);
    const repository = new DouyinMiniappInstallationsRepository(client);

    await expect(repository.findActiveByAuthorizerAppId("authorizer-appid"))
      .resolves.toEqual(installationRow);

    expect(calls).toContainEqual({ method: "eq", args: ["authorizer_appid", "authorizer-appid"] });
    expect(calls).toContainEqual({
      method: "in",
      args: ["authorization_status", ["authorized_unbound", "active"]],
    });
    const selected = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(selected).not.toContain("*");
    expect(selected).toContain("refresh_token_key_version");
  });

  test("merchant lookup matches both authorizer_appid and deployment_key", async () => {
    const { client, calls } = createClient([{ data: installationRow, error: null }]);
    const repository = new DouyinMiniappInstallationsRepository(client);

    await repository.findActiveMerchant("authorizer-appid", "merchant-a");

    expect(calls).toContainEqual({ method: "eq", args: ["authorizer_appid", "authorizer-appid"] });
    expect(calls).toContainEqual({ method: "eq", args: ["deployment_key", "merchant-a"] });
    expect(calls).toContainEqual({ method: "eq", args: ["installation_kind", "merchant"] });
    expect(calls).toContainEqual({ method: "eq", args: ["authorization_status", "active"] });
  });

  test("tenant binding delegates validation and serialization to one RPC", async () => {
    const { client, calls } = createClient([{ data: installationRow, error: null }]);
    const repository = new DouyinMiniappInstallationsRepository(client);

    await expect(repository.bindActiveTenant({
      authorizerAppId: "authorizer-appid",
      tenantId: "tenant-id",
      deploymentKey: "merchant-a",
      runtimeConfig: { brand: { name: "Merchant A" } },
    })).resolves.toEqual(installationRow);

    expect(calls).toContainEqual({ method: "rpc", args: [
      "bind_douyin_miniapp_installation",
      { p_authorizer_appid: "authorizer-appid", p_tenant_id: "tenant-id",
        p_deployment_key: "merchant-a", p_runtime_config: { brand: { name: "Merchant A" } } },
    ] });
    expect(calls.some((call) => call.method === "from" || call.method === "update")).toBe(false);
  });

  test("maps inactive tenant binding to a stable conflict", async () => {
    const { client } = createClient([{
      data: null, error: { message: "DOUYIN_TENANT_NOT_ACTIVE", details: "tenant-id" },
    }]);
    await expect(new DouyinMiniappInstallationsRepository(client).bindActiveTenant({
      authorizerAppId: "authorizer-appid", tenantId: "tenant-id",
      deploymentKey: "merchant-a", runtimeConfig: {},
    })).rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_TENANT_NOT_ACTIVE" });
  });

  test("maps inactive component binding to a stable conflict", async () => {
    const { client } = createClient([{
      data: null,
      error: { message: "DOUYIN_COMPONENT_NOT_ACTIVE", details: "component-secret" },
    }]);
    let caught: unknown;
    try {
      await new DouyinMiniappInstallationsRepository(client).bindActiveTenant({
        authorizerAppId: "authorizer-appid",
        tenantId: "tenant-id",
        deploymentKey: "merchant-a",
        runtimeConfig: {},
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 409,
      code: "DOUYIN_COMPONENT_NOT_ACTIVE",
    });
    expect(JSON.stringify(caught)).not.toContain("component-secret");
  });

  test("keeps active cross-tenant and parameter changes serialized as RPC conflicts", async () => {
    for (const input of [
      { tenantId: "other-tenant", deploymentKey: "merchant-a", runtimeConfig: {} },
      { tenantId: "tenant-id", deploymentKey: "merchant-b", runtimeConfig: { changed: true } },
    ]) {
      const { client, calls } = createClient([{
        data: null, error: { message: "DOUYIN_INSTALLATION_BIND_CONFLICT" },
      }]);
      await expect(new DouyinMiniappInstallationsRepository(client).bindActiveTenant({
        authorizerAppId: "authorizer-appid", ...input,
      })).rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_INSTALLATION_BIND_CONFLICT" });
      expect(calls.filter((call) => call.method === "rpc")).toHaveLength(1);
      expect(calls.some((call) => call.method === "from" || call.method === "update")).toBe(false);
    }
  });

  test("maps concurrent deployment-key uniqueness conflicts to a stable safe 409", async () => {
    const sensitiveDetail = "Key (tenant_id, deployment_key)=(secret-tenant, merchant-a)";
    const { client } = createClient([{
      data: null,
      error: { code: "23505", message: "duplicate key value violates unique constraint",
        details: sensitiveDetail },
    }]);
    let caught: unknown;
    try {
      await new DouyinMiniappInstallationsRepository(client).bindActiveTenant({
        authorizerAppId: "authorizer-appid", tenantId: "tenant-id",
        deploymentKey: "merchant-a", runtimeConfig: {},
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 409, code: "DOUYIN_INSTALLATION_BIND_CONFLICT",
    });
    expect(JSON.stringify(caught)).not.toContain(sensitiveDetail);
  });

  test("wraps rejected database operations without exposing their exception", async () => {
    const query: DouyinInstallationQuery = {
      select: () => query,
      update: () => query,
      eq: () => query,
      in: () => query,
      maybeSingle: async () => { throw new TypeError("network leaked refresh-ciphertext"); },
    };
    const client: DouyinInstallationDatabaseClient = {
      from: () => query,
      rpc: async () => ({ data: null, error: null }),
    };
    let caught: unknown;
    try {
      await new DouyinMiniappInstallationsRepository(client)
        .findActiveMerchant("authorizer-appid", "merchant-a");
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "DOUYIN_INSTALLATION_REPOSITORY_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("refresh-ciphertext");
  });
});

describe("DouyinMiniappInstallationsRepository refresh RPCs", () => {
  test("validates the claim RPC as a zero-or-one row result", async () => {
    const lease = { claim_token: "11111111-1111-4111-8111-111111111111", claim_expires_at: "2026-07-20T00:00:30.000Z" };
    const invalid = createClient([{ data: [lease, lease], error: null }]);
    await expect(new DouyinMiniappInstallationsRepository(invalid.client)
      .claimAccessTokenRefresh(installationRow.id))
      .rejects.toMatchObject({ code: "DOUYIN_INSTALLATION_REPOSITORY_RESPONSE_INVALID" });
  });

  test("complete input enforces five all-string or five all-null rotation fields", async () => {
    const noRotation: AuthorizerRefreshRotation = {
      ciphertext: null, iv: null, tag: null, keyVersion: null, expiresAt: null,
    };
    // @ts-expect-error partial refresh-token rotation is forbidden by the repository contract.
    const partial: AuthorizerRefreshRotation = {
      ciphertext: "ciphertext", iv: null, tag: null, keyVersion: null, expiresAt: null,
    };
    expect(partial).toBeDefined();

    const { client, calls } = createClient([{ data: true, error: null }]);
    const repository = new DouyinMiniappInstallationsRepository(client);
    await expect(repository.completeAccessTokenRefresh({
      installationId: installationRow.id,
      claimToken: "11111111-1111-4111-8111-111111111111",
      accessToken: {
        ciphertext: "access-cipher", iv: "access-iv", tag: "access-tag",
        keyVersion: "v2", expiresAt: "2026-07-20T02:00:00.000Z",
      },
      refreshToken: noRotation,
    })).resolves.toBe(true);

    expect(calls.find((call) => call.method === "rpc")?.args).toEqual([
      "complete_douyin_authorizer_token_refresh",
      {
        p_installation_id: installationRow.id,
        p_claim_token: "11111111-1111-4111-8111-111111111111",
        p_access_token_ciphertext: "access-cipher",
        p_access_token_iv: "access-iv",
        p_access_token_tag: "access-tag",
        p_access_token_key_version: "v2",
        p_access_token_expires_at: "2026-07-20T02:00:00.000Z",
        p_refresh_token_ciphertext: null,
        p_refresh_token_iv: null,
        p_refresh_token_tag: null,
        p_refresh_token_key_version: null,
        p_refresh_token_expires_at: null,
      },
    ]);
  });

  test("rejects runtime partial, empty and invalid-date refresh rotations before RPC", async () => {
    const invalidRotations = [
      { ciphertext: "cipher", iv: null, tag: null, keyVersion: null, expiresAt: null },
      { ciphertext: "cipher", iv: "", tag: "tag", keyVersion: "v2", expiresAt: "2026-08-20T00:00:00.000Z" },
      { ciphertext: "cipher", iv: "iv", tag: "tag", keyVersion: "v2", expiresAt: "not-a-date" },
    ];

    for (const refreshToken of invalidRotations) {
      const { client, calls } = createClient([{ data: true, error: null }]);
      const repository = new DouyinMiniappInstallationsRepository(client);
      await expect(repository.completeAccessTokenRefresh({
        installationId: installationRow.id,
        claimToken: "11111111-1111-4111-8111-111111111111",
        accessToken: {
          ciphertext: "access-cipher", iv: "access-iv", tag: "access-tag",
          keyVersion: "v2", expiresAt: "2026-07-20T02:00:00.000Z",
        },
        refreshToken: refreshToken as unknown as AuthorizerRefreshRotation,
      })).rejects.toMatchObject({ code: "DOUYIN_AUTHORIZER_REFRESH_ROTATION_INVALID" });
      expect(calls.some((call) => call.method === "rpc")).toBe(false);
    }
  });

  test("fails a matching lease with only a stable non-sensitive error code", async () => {
    const { client, calls } = createClient([{ data: false, error: null }]);
    const repository = new DouyinMiniappInstallationsRepository(client);
    await expect(repository.failAccessTokenRefresh({
      installationId: installationRow.id,
      claimToken: "11111111-1111-4111-8111-111111111111",
      errorCode: "DOUYIN_AUTHORIZATION_EXPIRED",
    })).resolves.toBe(false);
    expect(calls.find((call) => call.method === "rpc")?.args).toEqual([
      "fail_douyin_authorizer_token_refresh",
      {
        p_installation_id: installationRow.id,
        p_claim_token: "11111111-1111-4111-8111-111111111111",
        p_last_refresh_error_code: "DOUYIN_AUTHORIZATION_EXPIRED",
      },
    ]);
  });
});

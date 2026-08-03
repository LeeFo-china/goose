import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository:
  typeof import("./douyin-miniapp-authorization-intents").DouyinMiniappAuthorizationIntentsRepository;

beforeAll(async () => {
  ({ DouyinMiniappAuthorizationIntentsRepository: Repository } = await import(
    "./douyin-miniapp-authorization-intents"
  ));
});

const INTENT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE_ID = "33333333-3333-4333-8333-333333333333";
const EXPIRES_AT = "2026-07-26T10:10:00.000Z";
const NOW = "2026-07-26T10:00:00.000Z";
const INTENT_DIGEST = "a".repeat(64);
const CODE_DIGEST = "b".repeat(64);

const intentRow = {
  id: INTENT_ID,
  tenant_id: TENANT_ID,
  requested_by_employee_id: EMPLOYEE_ID,
  component_appid: "component-appid",
  intent_digest: INTENT_DIGEST,
  authorization_code_digest: null,
  authorizer_appid: null,
  status: "pending",
  expires_at: EXPIRES_AT,
  completed_at: null,
  failure_code: null,
  created_at: NOW,
  updated_at: NOW,
};

function createClient() {
  const rpc = mock(async (name: string, _args: Record<string, unknown>) => {
    if (name === "claim_tenant_douyin_authorization_intent") {
      return {
        data: [{
          claim_state: "completing",
          intent_id: INTENT_ID,
          tenant_id: TENANT_ID,
          component_appid: "component-appid",
          expires_at: EXPIRES_AT,
          authorizer_appid: null,
        }],
        error: null,
      };
    }
    if (name === "fail_tenant_douyin_authorization_intent") {
      return { data: true, error: null };
    }
    return { data: intentRow, error: null };
  });
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: mock((_columns: string) => query),
    eq: mock((column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    }),
    in: mock((_column: string, _values: readonly string[]) => query),
    maybeSingle: mock(async () => ({
      data: { authorizer_appid: "tt-authorizer" },
      error: null,
    })),
  };
  return {
    client: {
      rpc,
      from: mock((_table: string) => query),
    },
    rpc,
    query,
    filters,
  };
}

describe("DouyinMiniappAuthorizationIntentsRepository", () => {
  test("creates an intent only through the creation RPC", async () => {
    const { client, rpc } = createClient();
    const repository = new Repository(client as never);

    await expect(repository.create({
      tenantId: TENANT_ID,
      requestedByEmployeeId: EMPLOYEE_ID,
      componentAppId: "component-appid",
      intentDigest: INTENT_DIGEST,
      expiresAt: EXPIRES_AT,
    })).resolves.toMatchObject({
      id: INTENT_ID,
      tenantId: TENANT_ID,
      intentDigest: INTENT_DIGEST,
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_tenant_douyin_authorization_intent",
      {
        p_tenant_id: TENANT_ID,
        p_requested_by_employee_id: EMPLOYEE_ID,
        p_component_appid: "component-appid",
        p_intent_digest: INTENT_DIGEST,
        p_expires_at: EXPIRES_AT,
      },
    );
  });

  test("claims and attaches the authorization-code digest atomically", async () => {
    const { client, rpc } = createClient();
    const repository = new Repository(client as never);

    await expect(repository.claim({
      intentDigest: INTENT_DIGEST,
      authorizationCodeDigest: CODE_DIGEST,
    })).resolves.toEqual({
      state: "completing",
      intentId: INTENT_ID,
      tenantId: TENANT_ID,
      componentAppId: "component-appid",
      expiresAt: EXPIRES_AT,
      authorizerAppId: null,
    });
    expect(rpc).toHaveBeenCalledWith(
      "claim_tenant_douyin_authorization_intent",
      {
        p_intent_digest: INTENT_DIGEST,
        p_authorization_code_digest: CODE_DIGEST,
      },
    );
  });

  test("completes binding through the atomic completion RPC", async () => {
    const { client, rpc } = createClient();
    const repository = new Repository(client as never);

    await repository.complete({
      intentId: INTENT_ID,
      authorizationCodeDigest: CODE_DIGEST,
      authorizerAppId: "tt-authorizer",
      deploymentKey: "deployment-key",
      runtimeConfig: { features: {} },
      accessToken: null,
      refreshToken: null,
      permissions: null,
    });

    expect(rpc).toHaveBeenCalledWith(
      "complete_tenant_douyin_authorization_intent",
      expect.objectContaining({
        p_intent_id: INTENT_ID,
        p_authorization_code_digest: CODE_DIGEST,
        p_authorizer_appid: "tt-authorizer",
        p_deployment_key: "deployment-key",
        p_access_token_ciphertext: null,
        p_refresh_token_ciphertext: null,
        p_permissions: null,
      }),
    );
  });

  test("fails through the failure RPC and resolves event correlation by digest", async () => {
    const { client, rpc, filters } = createClient();
    const repository = new Repository(client as never);

    await expect(repository.fail({
      intentId: INTENT_ID,
      failureCode: "DOUYIN_AUTHORIZATION_EXCHANGE_FAILED",
    })).resolves.toBeUndefined();
    await expect(
      repository.findAuthorizerByCodeDigest(CODE_DIGEST),
    ).resolves.toBe("tt-authorizer");

    expect(rpc).toHaveBeenCalledWith(
      "fail_tenant_douyin_authorization_intent",
      {
        p_intent_id: INTENT_ID,
        p_failure_code: "DOUYIN_AUTHORIZATION_EXCHANGE_FAILED",
      },
    );
    expect(filters).toContainEqual([
      "authorization_code_digest",
      CODE_DIGEST,
    ]);
    expect(filters).toContainEqual(["processing_state", "completed"]);
  });
});

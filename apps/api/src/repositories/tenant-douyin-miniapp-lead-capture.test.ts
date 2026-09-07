import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository:
  typeof import("./tenant-douyin-miniapp-lead-capture").TenantDouyinMiniappLeadCaptureRepository;

beforeAll(async () => {
  ({ TenantDouyinMiniappLeadCaptureRepository: Repository } = await import(
    "./tenant-douyin-miniapp-lead-capture"
  ));
});

const input = {
  tenantId: "33333333-3333-4333-8333-333333333333",
  installationId: "22222222-2222-4222-8222-222222222222",
  authorizerAppId: "ttd033a68e4e56ccd301",
  expectedUpdatedAt: "2026-09-06T00:00:00.000Z",
  enabled: true,
  clueComponentId: "5785490b6443ad9def6f88e69c57920c",
};
const data = {
  installation_id: input.installationId,
  authorizer_appid: input.authorizerAppId,
  enabled: true,
  clue_component_id: input.clueComponentId,
  updated_at: "2026-09-06T00:00:01.000Z",
};

function client(result: unknown, error: unknown = null) {
  return {
    rpc: mock(async () => ({ data: result, error })),
  };
}

describe("TenantDouyinMiniappLeadCaptureRepository", () => {
  test("calls only the atomic RPC with exact arguments", async () => {
    const database = client({ data });
    const repository = new Repository(database as never);
    await expect(repository.update(input)).resolves.toEqual(data);
    expect(database.rpc).toHaveBeenCalledWith(
      "update_douyin_miniapp_lead_capture_config",
      {
        p_tenant_id: input.tenantId,
        p_installation_id: input.installationId,
        p_authorizer_appid: input.authorizerAppId,
        p_expected_updated_at: input.expectedUpdatedAt,
        p_enabled: true,
        p_clue_component_id: input.clueComponentId,
      },
    );
  });

  test("maps stable business envelopes without raw details", async () => {
    const repository = new Repository(client({ error: {
      status_code: 409,
      code: "DOUYIN_LEAD_CAPTURE_CONFIG_STALE",
    } }) as never);
    await expect(repository.update(input)).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_LEAD_CAPTURE_CONFIG_STALE",
      details: undefined,
    });
  });

  test("fails closed for database and malformed responses", async () => {
    for (const database of [
      client(null, { message: "raw database detail" }),
      client({ data: { ...data, secret: "raw" } }),
      { rpc: mock(() => Promise.reject(new Error("raw rejection"))) },
    ]) {
      const repository = new Repository(database as never);
      await expect(repository.update(input)).rejects.toMatchObject({
        statusCode: 500,
        code: "DB_ERROR",
        details: undefined,
      });
    }
  });
});

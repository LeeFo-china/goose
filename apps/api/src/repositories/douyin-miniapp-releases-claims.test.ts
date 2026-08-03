import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  DouyinMiniappReleaseDatabaseClient,
  DouyinMiniappReleaseDatabaseResult,
  DouyinMiniappReleaseQuery,
} from "./douyin-miniapp-releases";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./douyin-miniapp-releases").DouyinMiniappReleasesRepository;
beforeAll(async () => {
  ({ DouyinMiniappReleasesRepository: Repository } = await import(
    "./douyin-miniapp-releases"
  ));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: DouyinMiniappReleaseDatabaseResult[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class Query implements DouyinMiniappReleaseQuery {
    private chain(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(columns: string, options?: unknown) {
      return this.chain("select", [columns, options]);
    }
    insert(value: unknown) { return this.chain("insert", [value]); }
    update(value: unknown) { return this.chain("update", [value]); }
    eq(column: string, value: unknown) { return this.chain("eq", [column, value]); }
    order(column: string, options: unknown) { return this.chain("order", [column, options]); }
    range(from: number, to: number) { return this.chain("range", [from, to]); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null });
    }
    single() {
      calls.push({ method: "single", args: [] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null });
    }
    then<TResult1 = DouyinMiniappReleaseDatabaseResult, TResult2 = never>(
      onfulfilled?: (
        (value: DouyinMiniappReleaseDatabaseResult) => TResult1 | PromiseLike<TResult1>
      ) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      calls.push({ method: "then", args: [] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null })
        .then(onfulfilled, onrejected);
    }
  }
  const client: DouyinMiniappReleaseDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
    rpc: mock((name: string, args: Record<string, unknown>) => {
      calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(results[resultIndex++] ?? { data: null, error: null });
    }),
  };
  return { client, calls };
}

const CLAIM_TOKEN = "44444444-4444-4444-8444-444444444444";
const CLAIM_EXPIRES_AT = "2026-07-20T01:05:00.000Z";
const releaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  template_id: "9133504853504535288",
  template_version: "1.2.3",
  description: "装修行业模板首发",
  channel: "default" as const,
  ext_json: {
    extEnable: true as const,
    extAppid: "tt-authorizer-1",
    ext: { deployment_key: "merchant-demo" },
  },
  status: "created" as const,
  douyin_log_id: null,
  test_qr_url: null,
  audit_host_names: [],
  audit_note: null,
  audit_result: null,
  submitted_at: null,
  audited_at: null,
  released_at: null,
  platform_operator_id: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-07-20T01:00:00.000Z",
  updated_at: "2026-07-20T01:00:00.000Z",
};

describe("DouyinMiniappReleasesRepository operation claims", () => {
  test("exposes no write path that can bypass an exact operation claim", () => {
    const repository = new Repository(createClient([]).client) as unknown as Record<string, unknown>;
    expect(repository.create).toBeUndefined();
    expect(repository.update).toBeUndefined();
  });

  test("claims one expected-status operation through the atomic RPC", async () => {
    const claimRow = {
      release_id: releaseRow.id,
      claim_token: CLAIM_TOKEN,
      claim_expires_at: CLAIM_EXPIRES_AT,
      recovery_required: false,
    };
    const { client, calls } = createClient([{ data: [claimRow], error: null }]);
    await expect(new Repository(client).claimOperation({
      releaseId: releaseRow.id,
      expectedStatuses: ["uploaded", "testing"],
      operationName: "test_qr",
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: CLAIM_EXPIRES_AT,
      platformOperatorId: releaseRow.platform_operator_id,
    })).resolves.toEqual({
      releaseId: releaseRow.id,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: CLAIM_EXPIRES_AT,
      recoveryRequired: false,
    });
    expect(calls).toContainEqual({ method: "rpc", args: [
      "claim_douyin_miniapp_release_operation",
      {
        p_release_id: releaseRow.id,
        p_expected_statuses: ["uploaded", "testing"],
        p_operation_name: "test_qr",
        p_claim_token: CLAIM_TOKEN,
        p_claim_expires_at: CLAIM_EXPIRES_AT,
        p_operator_id: releaseRow.platform_operator_id,
      },
    ] });
  });

  test("atomically gets or creates and claims one upload delivery", async () => {
    const internalRow = {
      ...releaseRow,
      operation_name: "upload" as const,
      operation_claim_token: CLAIM_TOKEN,
      operation_claim_expires_at: CLAIM_EXPIRES_AT,
      recovery_required: false,
    };
    const { client, calls } = createClient([{ data: [internalRow], error: null }]);
    const result = await new Repository(client).getOrCreateAndClaimUpload({
      installationId: releaseRow.installation_id,
      templateId: releaseRow.template_id,
      templateVersion: releaseRow.template_version,
      description: releaseRow.description,
      channel: releaseRow.channel,
      extJson: releaseRow.ext_json,
      platformOperatorId: releaseRow.platform_operator_id,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: CLAIM_EXPIRES_AT,
    });
    expect(result).toEqual(internalRow);
    expect(calls[0]).toEqual({ method: "rpc", args: [
      "get_or_create_and_claim_douyin_miniapp_release_upload",
      expect.objectContaining({
        p_installation_id: releaseRow.installation_id,
        p_template_id: releaseRow.template_id,
        p_template_version: releaseRow.template_version,
        p_channel: releaseRow.channel,
        p_claim_token: CLAIM_TOKEN,
      }),
    ] });
    expect(JSON.stringify(calls)).not.toMatch(/accessToken|access_token|secret/i);
  });

  test("returns null when another release in the installation holds the upload claim", async () => {
    const { client } = createClient([{ data: [], error: null }]);
    await expect(new Repository(client).getOrCreateAndClaimUpload({
      installationId: releaseRow.installation_id,
      templateId: releaseRow.template_id,
      templateVersion: releaseRow.template_version,
      description: releaseRow.description,
      channel: releaseRow.channel,
      extJson: releaseRow.ext_json,
      platformOperatorId: releaseRow.platform_operator_id,
      claimToken: CLAIM_TOKEN,
      claimExpiresAt: CLAIM_EXPIRES_AT,
    })).resolves.toBeNull();
  });

  test("maps same-version delivery identity mismatches to a stable safe conflict", async () => {
    const { client } = createClient([{
      data: null,
      error: {
        message: "DOUYIN_MINIAPP_RELEASE_DELIVERY_CONFLICT",
        details: "access_token=must-not-leak",
      },
    }]);
    let caught: unknown;
    try {
      await new Repository(client).getOrCreateAndClaimUpload({
        installationId: releaseRow.installation_id,
        templateId: releaseRow.template_id,
        templateVersion: releaseRow.template_version,
        description: "different delivery",
        channel: releaseRow.channel,
        extJson: releaseRow.ext_json,
        platformOperatorId: releaseRow.platform_operator_id,
        claimToken: CLAIM_TOKEN,
        claimExpiresAt: CLAIM_EXPIRES_AT,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 409,
      code: "DOUYIN_MINIAPP_RELEASE_DELIVERY_CONFLICT",
    });
    expect(JSON.stringify(caught)).not.toContain("must-not-leak");
  });

  test("updates only the matching claim and clears all internal lease fields", async () => {
    const updated = { ...releaseRow, status: "testing" as const };
    const { client, calls } = createClient([{ data: updated, error: null }]);
    await expect(new Repository(client).updateClaimed(releaseRow.id, CLAIM_TOKEN, {
      status: "testing",
      testQrUrl: "https://p3.douyinpic.com/test.png",
      platformOperatorId: releaseRow.platform_operator_id,
    })).resolves.toEqual(updated);
    expect(calls).toContainEqual({ method: "update", args: [expect.objectContaining({
      status: "testing",
      operation_name: null,
      operation_claim_token: null,
      operation_claim_expires_at: null,
    })] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", releaseRow.id] });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["operation_claim_token", CLAIM_TOKEN],
    });
    const selected = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(selected).not.toMatch(/operation_claim_token|token|secret|phone|openid/i);
  });

  test("patches the matching claim without releasing its lease", async () => {
    const patched = { ...releaseRow, audit_note: "装修模板提审" };
    const { client, calls } = createClient([{ data: patched, error: null }]);
    await expect(new Repository(client).patchClaimed(releaseRow.id, CLAIM_TOKEN, {
      auditHostNames: ["douyin"],
      auditNote: "装修模板提审",
      platformOperatorId: releaseRow.platform_operator_id,
    })).resolves.toEqual(patched);
    expect(calls).toContainEqual({ method: "update", args: [{
      audit_host_names: ["douyin"],
      audit_note: "装修模板提审",
      platform_operator_id: releaseRow.platform_operator_id,
    }] });
    expect(calls).toContainEqual({
      method: "eq",
      args: ["operation_claim_token", CLAIM_TOKEN],
    });
  });

  test("rejects malformed claim inputs before database access", async () => {
    const { client, calls } = createClient([]);
    await expect(new Repository(client).claimOperation({
      releaseId: releaseRow.id,
      expectedStatuses: [],
      operationName: "unknown" as never,
      claimToken: "not-a-uuid",
      claimExpiresAt: "not-a-date",
      platformOperatorId: releaseRow.platform_operator_id,
    })).rejects.toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID" });
    expect(calls).toHaveLength(0);
  });
});

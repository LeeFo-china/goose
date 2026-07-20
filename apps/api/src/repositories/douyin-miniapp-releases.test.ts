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
  };
  return { client, calls };
}

const releaseRow = {
  id: "11111111-1111-4111-8111-111111111111",
  installation_id: "22222222-2222-4222-8222-222222222222",
  template_id: "9133504853504535288",
  template_version: "1.2.3-beta.1",
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

describe("DouyinMiniappReleasesRepository", () => {
  test("lists one installation with exact projection, count, and bounded range", async () => {
    const { client, calls } = createClient([{
      data: [releaseRow], error: null, count: 121,
    }]);
    const repository = new Repository(client);

    await expect(repository.listByInstallation({
      installationId: releaseRow.installation_id,
      page: 2,
      pageSize: 100,
    })).resolves.toEqual({ list: [releaseRow], total: 121 });

    expect(calls).toContainEqual({ method: "eq", args: [
      "installation_id", releaseRow.installation_id,
    ] });
    expect(calls).toContainEqual({ method: "order", args: [
      "created_at", { ascending: false },
    ] });
    expect(calls).toContainEqual({ method: "order", args: [
      "id", { ascending: false },
    ] });
    expect(calls.filter((call) => call.method === "order")).toEqual([
      { method: "order", args: ["created_at", { ascending: false }] },
      { method: "order", args: ["id", { ascending: false }] },
    ]);
    expect(calls).toContainEqual({ method: "range", args: [100, 199] });
    const select = calls.find((call) => call.method === "select")!;
    expect(select.args[1]).toEqual({ count: "exact" });
    expect(String(select.args[0])).not.toMatch(/\*|token|secret|phone|openid/i);
  });

  test("finds one release by id with the same strict safe projection", async () => {
    const { client, calls } = createClient([{ data: releaseRow, error: null }]);
    await expect(new Repository(client).findById(releaseRow.id)).resolves.toEqual(releaseRow);
    expect(calls).toContainEqual({ method: "eq", args: ["id", releaseRow.id] });
    expect(calls).toContainEqual({ method: "maybeSingle", args: [] });
  });

  test("rejects invalid pagination before it can create an unbounded range", async () => {
    for (const pagination of [
      { page: 0, pageSize: 20 },
      { page: 1, pageSize: 101 },
    ]) {
      const { client, calls } = createClient([]);
      await expect(new Repository(client).listByInstallation({
        installationId: releaseRow.installation_id,
        ...pagination,
      })).rejects.toMatchObject({
        code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID",
      });
      expect(calls).toHaveLength(0);
    }
  });

  test("creates only immutable safe release fields and requires its operator", async () => {
    const { client, calls } = createClient([{ data: releaseRow, error: null }]);
    const input = {
      installationId: releaseRow.installation_id,
      templateId: releaseRow.template_id,
      templateVersion: releaseRow.template_version,
      description: releaseRow.description,
      channel: releaseRow.channel,
      extJson: releaseRow.ext_json,
      platformOperatorId: releaseRow.platform_operator_id,
      accessToken: "must-not-persist",
    };
    await expect(new Repository(client).create(input)).resolves.toEqual(releaseRow);
    expect(calls).toContainEqual({ method: "insert", args: [{
      installation_id: releaseRow.installation_id,
      template_id: releaseRow.template_id,
      template_version: releaseRow.template_version,
      description: releaseRow.description,
      channel: "default",
      ext_json: releaseRow.ext_json,
      status: "created",
      platform_operator_id: releaseRow.platform_operator_id,
    }] });
    expect(JSON.stringify(calls)).not.toContain("must-not-persist");
    expect(calls).toContainEqual({ method: "single", args: [] });
  });

  test("allows public ext values containing sensitive-looking words when keys are exact", async () => {
    const publicValueRow = {
      ...releaseRow,
      template_version: "1.2.3-beta.1+build.01",
      ext_json: {
        ...releaseRow.ext_json,
        ext: { deployment_key: "public-token-label" },
      },
    };
    const { client, calls } = createClient([{ data: publicValueRow, error: null }]);

    await expect(new Repository(client).create({
      installationId: publicValueRow.installation_id,
      templateId: publicValueRow.template_id,
      templateVersion: publicValueRow.template_version,
      description: publicValueRow.description,
      channel: publicValueRow.channel,
      extJson: publicValueRow.ext_json,
      platformOperatorId: publicValueRow.platform_operator_id,
    })).resolves.toEqual(publicValueRow);

    expect(calls).toContainEqual({ method: "insert", args: [expect.objectContaining({
      ext_json: publicValueRow.ext_json,
    })] });
  });

  test("rejects non-SemVer template versions before storage", async () => {
    for (const templateVersion of ["01.2.3", "1.02.3", "1.2.03", "1.2.3-..", "1.2.3-01"]) {
      const { client, calls } = createClient([]);
      await expect(new Repository(client).create({
        installationId: releaseRow.installation_id,
        templateId: releaseRow.template_id,
        templateVersion,
        description: releaseRow.description,
        channel: releaseRow.channel,
        extJson: releaseRow.ext_json,
        platformOperatorId: releaseRow.platform_operator_id,
      })).rejects.toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID" });
      expect(calls).toHaveLength(0);
    }
  });

  test("rejects duplicate audit hosts before storage", async () => {
    const { client, calls } = createClient([]);
    await expect(new Repository(client).update(releaseRow.id, {
      auditHostNames: ["douyin", "douyin"],
      platformOperatorId: releaseRow.platform_operator_id,
    })).rejects.toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID" });
    expect(calls).toHaveLength(0);
  });

  test("wraps malformed QR URLs as repository input errors before storage", async () => {
    const { client, calls } = createClient([]);

    await expect(new Repository(client).update(releaseRow.id, {
      testQrUrl: "not-a-url",
      platformOperatorId: releaseRow.platform_operator_id,
    })).rejects.toMatchObject({
      code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID",
    });
    expect(calls).toHaveLength(0);
  });

  test("updates only allowlisted safe delivery metadata", async () => {
    const updated = {
      ...releaseRow,
      status: "audit_pending" as const,
      douyin_log_id: "log_123",
      test_qr_url: "https://p3.douyinpic.com/qr.png?signature=abc#preview",
      audit_host_names: ["open.douyin.com"],
      audit_note: "装修模板提审",
      audit_result: { audit_id: "audit_1", status: "pending" as const },
      submitted_at: "2026-07-20T02:00:00.000Z",
      updated_at: "2026-07-20T02:00:00.000Z",
    };
    const { client, calls } = createClient([{ data: updated, error: null }]);
    const patch = {
      status: updated.status,
      douyinLogId: updated.douyin_log_id,
      testQrUrl: updated.test_qr_url,
      auditHostNames: updated.audit_host_names,
      auditNote: updated.audit_note,
      auditResult: updated.audit_result,
      submittedAt: updated.submitted_at,
      platformOperatorId: releaseRow.platform_operator_id,
      rawResponse: { access_token: "must-not-persist" },
    };
    await expect(new Repository(client).update(releaseRow.id, patch)).resolves.toEqual(updated);
    expect(calls).toContainEqual({ method: "update", args: [{
      status: "audit_pending",
      douyin_log_id: "log_123",
      test_qr_url: updated.test_qr_url,
      audit_host_names: ["open.douyin.com"],
      audit_note: "装修模板提审",
      audit_result: { audit_id: "audit_1", status: "pending" },
      submitted_at: updated.submitted_at,
      platform_operator_id: releaseRow.platform_operator_id,
    }] });
    expect(JSON.stringify(calls)).not.toContain("must-not-persist");
    expect(calls).toContainEqual({ method: "eq", args: ["id", releaseRow.id] });
  });

  test("fails closed on malformed rows, unsafe metadata, and database details", async () => {
    const malformed = createClient([{ data: { ...releaseRow, extra: "unsafe" }, error: null }]);
    await expect(new Repository(malformed.client).findById(releaseRow.id)).rejects.toMatchObject({
      code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_RESPONSE_INVALID",
    });

    const unsafe = createClient([]);
    const unsafeExtJson = { ...releaseRow.ext_json, access_token: "secret" };
    await expect(new Repository(unsafe.client).create({
      installationId: releaseRow.installation_id,
      templateId: releaseRow.template_id,
      templateVersion: releaseRow.template_version,
      description: releaseRow.description,
      channel: releaseRow.channel,
      extJson: unsafeExtJson,
      platformOperatorId: releaseRow.platform_operator_id,
    })).rejects.toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_INPUT_INVALID" });
    expect(unsafe.calls).toHaveLength(0);

    const sensitive = "postgres detail access_token=secret";
    const failed = createClient([{ data: null, error: { message: sensitive, details: sensitive } }]);
    let caught: unknown;
    try {
      await new Repository(failed.client).findById(releaseRow.id);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "DOUYIN_MINIAPP_RELEASE_REPOSITORY_ERROR" });
    expect(JSON.stringify(caught)).not.toContain(sensitive);
  });
});

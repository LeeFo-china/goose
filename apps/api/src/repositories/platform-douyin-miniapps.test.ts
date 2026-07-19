import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { PlatformDouyinMiniappSafeRecord } from "@/schema/platform-douyin-miniapps";
import type {
  PlatformDouyinMiniappsDatabaseClient,
  PlatformDouyinMiniappsDatabaseResult,
  PlatformDouyinMiniappsQuery,
} from "./platform-douyin-miniapps";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let PlatformDouyinMiniappsRepository:
  typeof import("./platform-douyin-miniapps").PlatformDouyinMiniappsRepository;

beforeAll(async () => {
  ({ PlatformDouyinMiniappsRepository } = await import("./platform-douyin-miniapps"));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };

function createClient(results: PlatformDouyinMiniappsDatabaseResult[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements PlatformDouyinMiniappsQuery {
    private chain(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(columns: string, options?: unknown) { return this.chain("select", [columns, options]); }
    update(value: unknown) { return this.chain("update", [value]); }
    eq(column: string, value: unknown) { return this.chain("eq", [column, value]); }
    in(column: string, values: readonly string[]) { return this.chain("in", [column, values]); }
    order(column: string, options: unknown) { return this.chain("order", [column, options]); }
    range(from: number, to: number) { return this.chain("range", [from, to]); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null });
    }
    then<TResult1 = PlatformDouyinMiniappsDatabaseResult, TResult2 = never>(
      onfulfilled?: ((value: PlatformDouyinMiniappsDatabaseResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      calls.push({ method: "then", args: [] });
      return Promise.resolve(results[index++] ?? { data: null, error: null })
        .then(onfulfilled, onrejected);
    }
  }
  const client: PlatformDouyinMiniappsDatabaseClient = {
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

const runtimeConfig = {
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: "#C45A32", navigation_text_color: "black" as const },
  features: { cases: true, sites: true, sms_lead: true, douyin_phone: false as const,
    phone_capture_mode: "sms" as const },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: "2026-07-19",
};

const managementRow: PlatformDouyinMiniappSafeRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  tenant_id: "33333333-3333-4333-8333-333333333333",
  component_appid: "component-appid",
  authorizer_appid: "authorizer-appid",
  installation_kind: "merchant",
  authorization_status: "active",
  permission_snapshot: [],
  runtime_config: runtimeConfig,
  template_id: null,
  template_version: null,
  last_submitted_at: null,
  last_audited_at: null,
  last_released_at: null,
  revoked_at: null,
  created_at: "2026-07-19T00:00:00+00:00",
  updated_at: "2026-07-20T00:00:00+00:00",
  tenant: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "示例装饰",
    slug: "demo",
    status: "active",
  },
};

describe("PlatformDouyinMiniappsRepository", () => {
  test("lists only safe named fields with exact count and bounded range", async () => {
    const { client, calls } = createClient([{
      data: [managementRow], error: null, count: 121,
    }]);
    const repository = new PlatformDouyinMiniappsRepository(client);

    await expect(repository.list({ page: 2, pageSize: 100 })).resolves.toEqual({
      list: [managementRow], total: 121,
    });

    expect(calls).toContainEqual({ method: "range", args: [100, 199] });
    expect(calls).toContainEqual({ method: "order", args: ["updated_at", { ascending: false }] });
    const select = calls.find((call) => call.method === "select")!;
    expect(select.args[1]).toEqual({ count: "exact" });
    expect(String(select.args[0])).not.toMatch(
      /\*|deployment_key|access_token|refresh_token|claim_token|last_error/,
    );
    expect(String(select.args[0])).toContain("tenant:tenants");
  });

  test("finds safe installations by id and AppID", async () => {
    for (const [method, column, value] of [
      ["findById", "id", managementRow.id],
      ["findByAuthorizerAppId", "authorizer_appid", managementRow.authorizer_appid],
    ] as const) {
      const { client, calls } = createClient([{ data: managementRow, error: null }]);
      const repository = new PlatformDouyinMiniappsRepository(client);
      await expect(repository[method](value)).resolves.toEqual(managementRow);
      expect(calls).toContainEqual({ method: "eq", args: [column, value] });
    }
  });

  test("reads only tenant id and status for validation", async () => {
    const tenant = { id: managementRow.tenant_id!, status: "active" as const };
    const { client, calls } = createClient([{ data: tenant, error: null }]);
    const repository = new PlatformDouyinMiniappsRepository(client);

    await expect(repository.findTenantStatusById(managementRow.tenant_id!))
      .resolves.toEqual(tenant);
    expect(calls).toContainEqual({ method: "from", args: ["tenants"] });
    expect(calls).toContainEqual({ method: "select", args: ["id,status", undefined] });
    expect(calls).toContainEqual({ method: "eq", args: ["id", managementRow.tenant_id] });
  });

  test("delegates template creation and enable to atomic RPCs", async () => {
    const template = { ...managementRow, authorizer_appid: "template-appid",
      installation_kind: "template_development" as const };
    const templateRpcRow = { id: template.id, authorizer_appid: "template-appid" };
    const enableRpcRow = { id: managementRow.id, authorization_status: "active" };
    const { client, calls } = createClient([
      { data: templateRpcRow, error: null },
      { data: template, error: null },
      { data: enableRpcRow, error: null },
      { data: managementRow, error: null },
    ]);
    const repository = new PlatformDouyinMiniappsRepository(client);

    await repository.createTemplateDevelopmentAtomically({
      componentAppId: "component-appid",
      authorizerAppId: "template-appid",
      tenantId: managementRow.tenant_id!,
      runtimeConfig,
    });
    await repository.enableAtomically(managementRow.id);

    expect(calls).toContainEqual({ method: "rpc", args: [
      "create_douyin_template_development_installation",
      { p_component_appid: "component-appid", p_authorizer_appid: "template-appid",
        p_tenant_id: managementRow.tenant_id, p_runtime_config: runtimeConfig },
    ] });
    expect(calls).toContainEqual({ method: "rpc", args: [
      "enable_douyin_miniapp_installation", { p_installation_id: managementRow.id },
    ] });
    expect(calls.some((call) => call.method === "insert")).toBe(false);
    expect(calls.filter((call) => call.method === "from" && call.args[0]
      === "douyin_miniapp_installations")).toHaveLength(2);
  });

  test("keeps config, key rotation and disable as status-guarded CAS writes", async () => {
    const actions = [
      ["updateRuntimeConfig", [managementRow.id, runtimeConfig], ["active", "disabled"]],
      ["rotateDeploymentKey", [managementRow.id, "new-key"], ["active"]],
      ["disable", [managementRow.id], ["active"]],
    ] as const;
    for (const [method, args, statuses] of actions) {
      const result = method === "disable"
        ? { ...managementRow, authorization_status: "disabled" }
        : managementRow;
      const { client, calls } = createClient([{ data: result, error: null }]);
      const repository = new PlatformDouyinMiniappsRepository(client);
      await (repository[method] as (...values: readonly unknown[]) => Promise<unknown>)(...args);
      expect(calls).toContainEqual({ method: "eq", args: ["id", managementRow.id] });
      expect(calls).toContainEqual({ method: "in", args: ["authorization_status", statuses] });
      expect(calls).toContainEqual({ method: "maybeSingle", args: [] });
    }
  });

  test("maps atomic RPC business failures without leaking database details", async () => {
    const cases = [
      ["DOUYIN_COMPONENT_NOT_ACTIVE", 409],
      ["DOUYIN_TENANT_NOT_ACTIVE", 409],
      ["DOUYIN_INSTALLATION_STATE_CONFLICT", 409],
      ["DOUYIN_TEMPLATE_INSTALLATION_CONFLICT", 409],
    ] as const;
    for (const [code, statusCode] of cases) {
      const sensitive = `database detail for ${code}`;
      const { client } = createClient([{
        data: null, error: { message: code, details: sensitive },
      }]);
      const repository = new PlatformDouyinMiniappsRepository(client);
      let caught: unknown;
      try {
        await repository.enableAtomically(managementRow.id);
      } catch (error) {
        caught = error;
      }
      expect(caught).toMatchObject({ statusCode, code });
      expect(JSON.stringify(caught)).not.toContain(sensitive);
    }
  });
});

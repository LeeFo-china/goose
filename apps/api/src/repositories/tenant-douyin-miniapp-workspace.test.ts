import { beforeAll, describe, expect, mock, test } from "bun:test";

import type {
  TenantDouyinMiniappWorkspaceDatabaseClient,
  TenantDouyinMiniappWorkspaceDatabaseResult,
  TenantDouyinMiniappWorkspaceQuery,
} from "./tenant-douyin-miniapp-workspace";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository:
  typeof import("./tenant-douyin-miniapp-workspace").TenantDouyinMiniappWorkspaceRepository;

beforeAll(async () => {
  ({ TenantDouyinMiniappWorkspaceRepository: Repository } = await import(
    "./tenant-douyin-miniapp-workspace"
  ));
});

type Call = {
  readonly table: string;
  readonly method: string;
  readonly args: readonly unknown[];
};

function createClient(results: TenantDouyinMiniappWorkspaceDatabaseResult[]) {
  const calls: Call[] = [];
  let resultIndex = 0;

  class Query implements TenantDouyinMiniappWorkspaceQuery {
    constructor(private readonly table: string) {}

    private chain(method: string, args: readonly unknown[]) {
      calls.push({ table: this.table, method, args });
      return this;
    }

    select(columns: string, options?: unknown) {
      return this.chain("select", [columns, options]);
    }

    eq(column: string, value: unknown) {
      return this.chain("eq", [column, value]);
    }

    neq(column: string, value: unknown) {
      return this.chain("neq", [column, value]);
    }

    in(column: string, values: readonly string[]) {
      return this.chain("in", [column, values]);
    }

    or(filters: string) {
      return this.chain("or", [filters]);
    }

    order(column: string, options: unknown) {
      return this.chain("order", [column, options]);
    }

    limit(value: number) {
      return this.chain("limit", [value]);
    }

    maybeSingle() {
      calls.push({ table: this.table, method: "maybeSingle", args: [] });
      return Promise.resolve(
        results[resultIndex++] ?? { data: null, error: null },
      );
    }

    then<
      TResult1 = TenantDouyinMiniappWorkspaceDatabaseResult,
      TResult2 = never,
    >(
      onfulfilled?: (
        value: TenantDouyinMiniappWorkspaceDatabaseResult,
      ) => TResult1 | PromiseLike<TResult1>,
      onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>,
    ) {
      return Promise.resolve(
        results[resultIndex++] ?? { data: null, error: null },
      ).then(onfulfilled, onrejected);
    }
  }

  const client: TenantDouyinMiniappWorkspaceDatabaseClient = {
    from: mock((table: string) => {
      calls.push({ table, method: "from", args: [table] });
      return new Query(table);
    }),
  };

  return { client, calls };
}

const TENANT_ID = "33333333-3333-4333-8333-333333333333";
const INSTALLATION_ID = "22222222-2222-4222-8222-222222222222";

describe("TenantDouyinMiniappWorkspaceRepository", () => {
  test("selects only tenant-safe installation fields", async () => {
    const { client, calls } = createClient([{ data: null, error: null }]);
    const repository = new Repository(client);

    await repository.findCurrentInstallation(TENANT_ID);

    const select = calls.find((call) =>
      call.table === "douyin_miniapp_installations"
      && call.method === "select"
    );
    expect(select?.args[0]).toBe(
      "id,authorizer_appid,installation_kind,authorization_status,"
      + "permission_snapshot,runtime_config,template_version,template_release_id,"
      + "created_at,updated_at",
    );
    expect(String(select?.args[0])).not.toMatch(
      /deployment_key|access_token|refresh_token|ciphertext|component_appid/,
    );
    expect(calls).toContainEqual({
      table: "douyin_miniapp_installations",
      method: "eq",
      args: ["tenant_id", TENANT_ID],
    });
    expect(calls).toContainEqual({
      table: "douyin_miniapp_installations",
      method: "eq",
      args: ["installation_kind", "merchant"],
    });
    expect(calls).toContainEqual({
      table: "douyin_miniapp_installations",
      method: "limit",
      args: [1],
    });
  });

  test("loads the internal tenant name separately from the public brand", async () => {
    const tenant = { id: TENANT_ID, name: "后台租户名称" };
    const { client, calls } = createClient([{ data: tenant, error: null }]);
    const repository = new Repository(client);

    await expect(repository.findTenantSummary(TENANT_ID)).resolves.toEqual(
      tenant,
    );
    expect(calls).toContainEqual({
      table: "tenants",
      method: "select",
      args: ["id,name", undefined],
    });
    expect(calls).toContainEqual({
      table: "tenants",
      method: "eq",
      args: ["id", TENANT_ID],
    });
  });

  test("counts public cases, active sites and service areas without loading rows", async () => {
    const { client, calls } = createClient([
      { data: null, error: null, count: 7 },
      { data: null, error: null, count: 2 },
      { data: null, error: null, count: 3 },
    ]);
    const repository = new Repository(client);

    await expect(repository.getPublicContentCounts(TENANT_ID)).resolves.toEqual({
      cases: 7,
      sites: 2,
      active_service_areas: 3,
    });

    const countSelects = calls.filter((call) => call.method === "select");
    expect(countSelects).toHaveLength(3);
    for (const select of countSelects) {
      expect(select.args).toEqual(["id", { count: "exact", head: true }]);
    }
    expect(calls).toContainEqual({
      table: "projects",
      method: "or",
      args: [
        "status.in.(signed,design_finalized,pending_start,started,constructing,acceptance),"
        + "visibility_status.eq.public",
      ],
    });
    expect(calls).toContainEqual({
      table: "projects",
      method: "in",
      args: ["status", ["started", "constructing"]],
    });
    expect(calls).toContainEqual({
      table: "tenant_service_areas",
      method: "eq",
      args: ["status", "active"],
    });
  });

  test("selects a tenant-safe latest release projection", async () => {
    const { client, calls } = createClient([{ data: null, error: null }]);
    const repository = new Repository(client);

    await repository.findLatestRelease(INSTALLATION_ID);

    const select = calls.find((call) =>
      call.table === "douyin_miniapp_releases"
      && call.method === "select"
    );
    expect(String(select?.args[0])).toContain(
      "id,installation_id,template_id,template_version,description,status",
    );
    expect(String(select?.args[0])).not.toMatch(
      /ext_json|deployment_key|operation_claim|platform_operator_id/,
    );
    expect(calls).toContainEqual({
      table: "douyin_miniapp_releases",
      method: "eq",
      args: ["installation_id", INSTALLATION_ID],
    });
    expect(calls).toContainEqual({
      table: "douyin_miniapp_releases",
      method: "order",
      args: ["created_at", { ascending: false }],
    });
    expect(calls).toContainEqual({
      table: "douyin_miniapp_releases",
      method: "limit",
      args: [1],
    });
  });
});

import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository:
  typeof import("./tenant-douyin-projects").TenantDouyinProjectsRepository;

beforeAll(async () => {
  ({ TenantDouyinProjectsRepository: Repository } = await import(
    "./tenant-douyin-projects"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown };

function clientWith(result: Result) {
  const calls: Call[] = [];
  class Query implements PromiseLike<Result> {
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    maybeSingle() { return Promise.resolve(result); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }
  return {
    calls,
    client: {
      from: mock((table: string) => {
        calls.push({ method: "from", args: [table] });
        return new Query();
      }),
      rpc: mock(() => Promise.resolve({ data: null, error: null })),
    },
  };
}

describe("TenantDouyinProjectsRepository display status", () => {
  test("lists final acceptance completed project ids for the current tenant page", async () => {
    const { client, calls } = clientWith({
      data: [
        { project_id: PROJECT_ID },
        { project_id: null },
      ],
      error: null,
    });
    const repository = new Repository(client as never);

    await expect(repository.listFinalAcceptanceCompletedProjectIds({
      tenantId: TENANT_ID,
      projectIds: [PROJECT_ID, PROJECT_ID],
    })).resolves.toEqual(new Set([PROJECT_ID]));

    expect(calls).toContainEqual({
      method: "from",
      args: ["project_acceptances"],
    });
    expect(calls).toContainEqual({ method: "select", args: ["project_id"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_ID] });
    expect(calls).toContainEqual({ method: "in", args: ["project_id", [PROJECT_ID]] });
    expect(calls).toContainEqual({ method: "eq", args: ["stage_code", "completion"] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "customer_confirmed"] });
  });
});

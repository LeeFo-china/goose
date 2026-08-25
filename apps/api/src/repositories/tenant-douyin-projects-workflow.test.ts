import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-projects").TenantDouyinProjectsRepository;

beforeAll(async () => {
  ({ TenantDouyinProjectsRepository: Repository } = await import(
    "./tenant-douyin-projects"
  ));
});

type Call = { method: string; args: unknown[] };
type Result = { data: unknown; error: unknown; count?: number | null };

function clientWith(result: Result) {
  const calls: Call[] = [];
  class Query implements PromiseLike<Result> {
    private chain(method: string, args: unknown[]) { calls.push({ method, args }); return this; }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) { return Promise.resolve(result).then(onfulfilled, onrejected); }
  }
  return {
    calls,
    client: { from: mock((table: string) => { calls.push({ method: "from", args: [table] }); return new Query(); }) },
  };
}

describe("TenantDouyinProjectsRepository workflow state reads", () => {
  test("lists workflow states for the current publication page without raw payloads", async () => {
    const tenantId = "11111111-1111-4111-8111-111111111111";
    const projectId = "22222222-2222-4222-8222-222222222222";
    const workflowState = { subject_id: projectId, instance_status: "running",
      current_node_title: "水电" };
    const { client, calls } = clientWith({ data: [workflowState], error: null });

    await expect(new Repository(client as never).listWorkflowStatesByProjectIds({
      tenantId, projectIds: [projectId, projectId],
    })).resolves.toEqual([workflowState]);

    expect(calls).toContainEqual({ method: "from", args: ["workflow_subject_states"] });
    expect(calls).toContainEqual({ method: "select",
      args: ["subject_id,instance_status,current_node_title"] });
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", tenantId] });
    expect(calls).toContainEqual({ method: "eq", args: ["subject_type", "project"] });
    expect(calls).toContainEqual({ method: "in", args: ["subject_id", [projectId]] });
    const select = String(calls.find((call) => call.method === "select")?.args[0]);
    expect(select).not.toMatch(/current_node_snapshot|timeline|actions|definition|tenant_id/i);
  });
});

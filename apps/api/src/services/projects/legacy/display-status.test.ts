import { beforeEach, describe, expect, mock, test } from "bun:test";

const acceptanceRows: Array<{ project_id: string | null }> = [];
const eqCalls: Array<readonly [string, unknown]> = [];
const inCalls: Array<readonly [string, unknown[]]> = [];

class ProjectAcceptancesQuery {
  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    eqCalls.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    inCalls.push([column, values]);
    return this;
  }

  then<TResult1 = {
    data: typeof acceptanceRows;
    error: null;
  }, TResult2 = never>(
    onfulfilled?: ((value: {
      data: typeof acceptanceRows;
      error: null;
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: acceptanceRows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => new ProjectAcceptancesQuery(),
    }),
  },
}));

describe("attachProjectDisplayStatuses", () => {
  beforeEach(() => {
    acceptanceRows.length = 0;
    eqCalls.length = 0;
    inCalls.length = 0;
  });

  test("marks final-accepted construction projects as completed even when legacy status is stale", async () => {
    acceptanceRows.push({ project_id: "project-1" });
    const { attachProjectDisplayStatuses } = await import("./display-status");

    const [project] = await attachProjectDisplayStatuses({
      tenantId: "tenant-1",
      rows: [{
        id: "project-1",
        status: "constructing",
      }],
    });

    expect(inCalls).toContainEqual(["project_id", ["project-1"]]);
    expect(project).toMatchObject({
      status: "constructing",
      status_label: "施工中",
      display_status: "final_acceptance_completed",
      display_status_label: "已完成",
    });
  });
});

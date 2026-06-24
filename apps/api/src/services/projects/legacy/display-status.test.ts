import { beforeEach, describe, expect, mock, test } from "bun:test";

type DisplayStatusStore = {
  acceptanceRows: Array<{ project_id: string | null }>;
  eqCalls: Array<readonly [string, unknown]>;
  inCalls: Array<readonly [string, unknown[]]>;
  fromCalls: string[];
};

function getDisplayStatusStore(): DisplayStatusStore {
  const source = globalThis as typeof globalThis & {
    __projectDisplayStatusStore?: DisplayStatusStore;
  };
  source.__projectDisplayStatusStore ??= {
    acceptanceRows: [],
    eqCalls: [],
    inCalls: [],
    fromCalls: [],
  };
  return source.__projectDisplayStatusStore;
}

class ProjectAcceptancesQuery {
  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    getDisplayStatusStore().eqCalls.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    getDisplayStatusStore().inCalls.push([column, values]);
    return this;
  }

  then<TResult1 = {
    data: Array<{ project_id: string | null }>;
    error: null;
  }, TResult2 = never>(
    onfulfilled?: ((value: {
      data: Array<{ project_id: string | null }>;
      error: null;
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({
      data: getDisplayStatusStore().acceptanceRows,
      error: null,
    }).then(
      onfulfilled,
      onrejected,
    );
  }
}

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => {
        getDisplayStatusStore().fromCalls.push(table);
        return new ProjectAcceptancesQuery();
      },
    }),
  },
}));

describe("attachProjectDisplayStatuses", () => {
  beforeEach(() => {
    const store = getDisplayStatusStore();
    store.acceptanceRows.length = 0;
    store.eqCalls.length = 0;
    store.inCalls.length = 0;
    store.fromCalls.length = 0;
  });

  test("marks final-accepted construction projects as completed even when legacy status is stale", async () => {
    const store = getDisplayStatusStore();
    store.acceptanceRows.push({ project_id: "project-1" });
    const { attachProjectDisplayStatuses } = await import("./display-status");

    const [project] = await attachProjectDisplayStatuses({
      tenantId: "tenant-1",
      rows: [{
        id: "project-1",
        status: "constructing",
      }],
    });

    expect(store.inCalls).toContainEqual(["project_id", ["project-1"]]);
    expect(project).toMatchObject({
      status: "constructing",
      status_label: "施工中",
      display_status: "final_acceptance_completed",
      display_status_label: "已完成",
    });
  });
});

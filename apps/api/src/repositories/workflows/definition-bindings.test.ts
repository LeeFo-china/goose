import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { WorkflowDefinitionRow } from "./types";

const NOW = "2026-06-27T00:00:00.000Z";

type QueryCall = {
  table: string;
  method: string;
  args: unknown[];
};

const queryCalls: QueryCall[] = [];
const workflowTable = mock((table: string) => createBuilder(table));

mock.module("./client", () => ({
  workflowTable,
}));

describe("listProjectConstructionWorkflowOptions", () => {
  beforeEach(() => {
    workflowTable.mockClear();
    queryCalls.length = 0;
  });

  test("includes custom active construction workflows as project candidates", async () => {
    const { listProjectConstructionWorkflowOptions } = await import(
      "./definition-bindings"
    );

    const result = await listProjectConstructionWorkflowOptions({
      tenantId: "tenant-1",
      page: 1,
      pageSize: 20,
    });

    expect(result.list.map((item) => item.id)).toEqual([
      "construction-main",
      "construction-custom",
    ]);
    expect(queryCalls.some((call) =>
      call.table === "workflow_definitions" &&
      call.method === "or" &&
      String(call.args[0]).includes("workflow_key.eq.construction_main")
    )).toBe(false);
  });
});

function createBuilder(table: string) {
  const builder = {
    select(...args: unknown[]) {
      queryCalls.push({ table, method: "select", args });
      return builder;
    },
    eq(...args: unknown[]) {
      queryCalls.push({ table, method: "eq", args });
      return builder;
    },
    not(...args: unknown[]) {
      queryCalls.push({ table, method: "not", args });
      return builder;
    },
    or(...args: unknown[]) {
      queryCalls.push({ table, method: "or", args });
      return builder;
    },
    order(...args: unknown[]) {
      queryCalls.push({ table, method: "order", args });
      return builder;
    },
    range(...args: unknown[]) {
      queryCalls.push({ table, method: "range", args });
      return Promise.resolve({
        data: table === "workflow_definitions" ? definitions() : [],
        error: null,
        count: table === "workflow_definitions" ? definitions().length : null,
      });
    },
    in(...args: unknown[]) {
      queryCalls.push({ table, method: "in", args });
      return Promise.resolve({
        data: [],
        error: null,
      });
    },
  };

  return builder;
}

function definitions(): WorkflowDefinitionRow[] {
  return [
    definition({
      id: "construction-main",
      workflow_key: "construction_main",
      name: "项目施工主流程",
    }),
    definition({
      id: "construction-custom",
      workflow_key: "construction_custom_mq7hqqgl_1_d0c5a149",
      name: "工程施工",
    }),
  ];
}

function definition(input: {
  id: string;
  workflow_key: string;
  name: string;
}): WorkflowDefinitionRow {
  return {
    id: input.id,
    tenant_id: "tenant-1",
    workflow_key: input.workflow_key,
    name: input.name,
    description: null,
    category: "construction",
    status: "active",
    active_version_id: `${input.id}-version`,
    created_by: null,
    updated_by: null,
    created_at: NOW,
    updated_at: NOW,
  };
}

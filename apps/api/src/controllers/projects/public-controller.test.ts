import { describe, expect, test } from "bun:test";
import { PublicProjectsQuerySchema } from "./public-controller";
import { serializePublicProjectListItem } from "./public-list-serializer";

describe("public project list query", () => {
  test("uses page 1 and pageSize 20 by default", () => {
    expect(PublicProjectsQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  test("rejects pageSize above 100", () => {
    expect(() => PublicProjectsQuerySchema.parse({ pageSize: 101 })).toThrow();
  });

  test("serializes only the public workflow display label", () => {
    const item = serializePublicProjectListItem({
      id: "project-1",
      tenant_id: "tenant-1",
      status: "constructing",
      display_status_label: "水电",
      current_node_key: "utilities",
      workflow_tasks: [{ id: "task-1" }],
      actions: ["complete"],
      permissions: ["workflow.manage"],
    });

    expect(item.display_status_label).toBe("水电");
    expect(item).not.toHaveProperty("current_node_key");
    expect(item).not.toHaveProperty("workflow_tasks");
    expect(item).not.toHaveProperty("actions");
    expect(item).not.toHaveProperty("permissions");
  });
});

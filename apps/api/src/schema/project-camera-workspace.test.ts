import { describe, expect, test } from "bun:test";
import { PROJECT_STATUS_VALUES } from "@gooes/domain";
import { ProjectCameraProjectGroupsQuerySchema } from "./project-cameras";

describe("camera workspace project query", () => {
  test("defaults to bound projects and 20 project rows", () => {
    expect(ProjectCameraProjectGroupsQuerySchema.parse({})).toEqual({
      page: 1, pageSize: 20, binding: "bound",
    });
  });
  test("accepts 100 projects, binding filters and domain statuses", () => {
    for (const binding of ["bound", "unbound", "all"] as const) {
      for (const project_status of PROJECT_STATUS_VALUES) {
        expect(ProjectCameraProjectGroupsQuerySchema.parse({
          page: "2", pageSize: "100", binding, project_status,
        })).toEqual({ page: 2, pageSize: 100, binding, project_status });
      }
    }
  });
  test("rejects invalid bounds and filters", () => {
    for (const input of [
      { page: 0 }, { page: 1.5 }, { pageSize: 101 }, { pageSize: 0 },
      { binding: "invalid" }, { project_status: "completed" },
    ]) expect(ProjectCameraProjectGroupsQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe("camera workspace detail query", () => {
  test("caps detail pages at 20 independently of project page size", async () => {
    const { ProjectCameraWorkspaceDevicesQuerySchema, ProjectCameraWorkspaceDevicesParamsSchema } = await import("./project-cameras");
    expect(ProjectCameraWorkspaceDevicesQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(ProjectCameraWorkspaceDevicesQuerySchema.parse({ page: "2", pageSize: "10" }))
      .toEqual({ page: 2, pageSize: 10 });
    for (const query of [{ pageSize: 21 }, { pageSize: 0 }, { page: 0 }, { page: 1.5 }]) {
      expect(ProjectCameraWorkspaceDevicesQuerySchema.safeParse(query).success).toBe(false);
    }
    expect(ProjectCameraWorkspaceDevicesParamsSchema.safeParse({ projectId: "invalid" }).success).toBe(false);
  });
});

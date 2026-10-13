import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import Fastify from "fastify";
import { registerRoutes } from "@/utils/decorators/route";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
afterEach(() => mock.restore());

describe("admin camera workspace routes", () => {
  test("new detail URL validates bounded paging and propagates read capability", async () => {
    const { default: controller } = await import("./index");
    const { projectCameraService } = await import("@/services/project-cameras");
    const detail = spyOn(projectCameraService, "listCameraWorkspaceDevices").mockResolvedValue({
      list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      status_source: "persisted",
    });
    const app = Fastify();
    const projectId = "00000000-0000-4000-8000-000000000001";
    let access: unknown;
    app.addHook("onRequest", async (request) => {
      access = request.routeOptions.config.tenantServiceAccess;
    });
    registerRoutes(app, controller);
    try {
      const result = await app.inject({ method: "GET", url: `/project-cameras/projects/${projectId}/devices` });
      expect(result.statusCode).toBe(200);
      expect(result.json().data.status_source).toBe("persisted");
      expect(access).toBe("read");
      expect(detail).toHaveBeenCalledWith({
        authUserId: undefined, projectId, query: { page: 1, pageSize: 20 },
        tenantServiceAccess: "read", requiredCapability: "core.projects",
      });
      detail.mockClear();
      for (const url of [
        `/project-cameras/projects/${projectId}/devices?pageSize=21`,
        "/project-cameras/projects/not-a-uuid/devices",
      ]) {
        expect((await app.inject({ method: "GET", url })).statusCode).toBe(400);
      }
      expect(detail).not.toHaveBeenCalled();
      const legacy = spyOn(projectCameraService, "listProjectCameras").mockResolvedValue({ list: [] });
      const oldResponse = await app.inject({ method: "GET", url: `/projects/${projectId}/cameras` });
      expect(oldResponse.statusCode).toBe(200);
      expect(oldResponse.json().data).toEqual({ list: [] });
      expect(legacy).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});

import { describe, expect, mock, test } from "bun:test";
import type { FastifyReply, FastifyRequest } from "fastify";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "00000000-0000-4000-8000-000000000001";

async function source(path: string) {
  return Bun.file(new URL(path, import.meta.url)).text();
}

describe("tenant service capability propagation", () => {
  test("keeps request route capability through nested project guards", async () => {
    const shared = await source("./project-cameras/legacy/shared.ts");
    const cameraBoundaries = await Promise.all([
      "./project-cameras/legacy/access.ts",
      "./project-cameras/legacy/channels.ts",
      "./project-cameras/legacy/lists.ts",
      "./project-cameras/legacy/mutations.ts",
      "./project-cameras/legacy/playback.ts",
      "./project-cameras/legacy/tencent-device.ts",
    ].map(source));
    const comments = await source("./project-log-comments.ts");

    expect(shared).toContain("TenantServiceAuthOptions");
    for (const boundary of cameraBoundaries) {
      expect(boundary).not.toContain(
        "{ tenantServiceAccess: input.tenantServiceAccess }",
      );
    }
    expect(comments).toContain(
      "requiredCapability: input.requiredCapability",
    );
  });

  test("propagates a camera route capability from controller to authorization", async () => {
    const [{ default: controller }, { authorizationService },
      { accessPolicyService }, { projectCameraRepository }] = await Promise.all([
        import("@/controllers/project-cameras"),
        import("@/services/authorization"),
        import("@/services/access-policy"),
        import("@/repositories/project-cameras"),
      ]);
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      tenant: accessPolicyService.assertTenantContext,
      visible: accessPolicyService.getVisibleProjectIds,
      list: projectCameraRepository.listCameraBindProjectOptions,
    };
    const auth = mock(async () => ({ employeeId: "employee-1", tenantId }));
    authorizationService.getRequiredAuthContext = auth as unknown as
      typeof authorizationService.getRequiredAuthContext;
    accessPolicyService.assertTenantContext = mock(() => tenantId);
    accessPolicyService.getVisibleProjectIds = mock(async () => []);
    projectCameraRepository.listCameraBindProjectOptions = mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    }));

    try {
      await controller.listCameraBindProjectOptions(request(
        "/projects/camera-bind-options",
        "read",
        { page: 1, pageSize: 20 },
      ), {} as FastifyReply);
      expect(auth).toHaveBeenCalledWith("auth-1", {
        tenantServiceAccess: "read",
        requiredCapability: "core.projects",
      });
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      accessPolicyService.assertTenantContext = originals.tenant;
      accessPolicyService.getVisibleProjectIds = originals.visible;
      projectCameraRepository.listCameraBindProjectOptions = originals.list;
    }
  });

  test("propagates a project-log route capability from controller to authorization", async () => {
    const [{ default: controller }, { authorizationService },
      { accessPolicyService }, { projectLogCommentsRepository }] = await Promise.all([
        import("@/controllers/project-log-comments"),
        import("@/services/authorization"),
        import("@/services/access-policy"),
        import("@/repositories/project-log-comments"),
      ]);
    const originals = {
      auth: authorizationService.getRequiredAuthContext,
      tenant: accessPolicyService.assertTenantContext,
      project: accessPolicyService.canAccessProject,
      employee: projectLogCommentsRepository.findEmployeeAuthorByAuthUserId,
      customer: projectLogCommentsRepository.findCustomerAuthorByAuthUserId,
      access: projectLogCommentsRepository.findProjectLogAccessInfo,
      list: projectLogCommentsRepository.listByLog,
    };
    const auth = mock(async () => ({ employeeId: "employee-1", tenantId }));
    authorizationService.getRequiredAuthContext = auth as unknown as
      typeof authorizationService.getRequiredAuthContext;
    accessPolicyService.assertTenantContext = mock(() => tenantId);
    accessPolicyService.canAccessProject = mock(async () => true);
    projectLogCommentsRepository.findEmployeeAuthorByAuthUserId = mock(
      async () => ({
        id: "employee-1",
        user_id: "auth-1",
        tenant_id: tenantId,
        name: "员工",
        avatar: null,
      }),
    );
    projectLogCommentsRepository.findCustomerAuthorByAuthUserId = mock(async () => null);
    projectLogCommentsRepository.findProjectLogAccessInfo = mock(async () => ({
      id: "log-1",
      project_id: "project-1",
      tenant_id: tenantId,
    }));
    projectLogCommentsRepository.listByLog = mock(async () => []);

    try {
      await controller.listComments(request(
        "/project_log_comments",
        "read",
        { log_id: "00000000-0000-4000-8000-000000000002" },
      ), {} as FastifyReply);
      expect(auth).toHaveBeenCalledWith("auth-1", {
        tenantServiceAccess: "read",
        requiredCapability: "core.projects",
      });
    } finally {
      authorizationService.getRequiredAuthContext = originals.auth;
      accessPolicyService.assertTenantContext = originals.tenant;
      accessPolicyService.canAccessProject = originals.project;
      projectLogCommentsRepository.findEmployeeAuthorByAuthUserId = originals.employee;
      projectLogCommentsRepository.findCustomerAuthorByAuthUserId = originals.customer;
      projectLogCommentsRepository.findProjectLogAccessInfo = originals.access;
      projectLogCommentsRepository.listByLog = originals.list;
    }
  });
});

function request(
  url: string,
  tenantServiceAccess: "read" | "write",
  query: Record<string, unknown>,
) {
  return {
    user: { sub: "auth-1", roles: ["employee"] },
    method: tenantServiceAccess === "read" ? "GET" : "POST",
    routeOptions: { url, config: { tenantServiceAccess } },
    query,
    headers: {},
    ip: "127.0.0.1",
  } as unknown as FastifyRequest;
}

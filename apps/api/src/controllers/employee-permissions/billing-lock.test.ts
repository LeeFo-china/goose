import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { FastifyRequest } from "fastify";
import type { AuthContext } from "@/services/authorization";

const authUserId = "auth-user-1";
const tenantId = "tenant-1";
const employeeId = "employee-1";

const authContext = {
  authUserId,
  employeeId,
  tenantId,
  tenantName: "固始晴天装饰",
  tenantSlug: "qingtian",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "出纳员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const getRequiredAuthContext = mock(
  async (): Promise<AuthContext> => authContext,
);

mock.module("@/services/authorization", () => ({
  authorizationService: {
    getRequiredAuthContext,
  },
}));

beforeEach(() => {
  getRequiredAuthContext.mockClear();
});

function buildRequest(): FastifyRequest {
  return {
    user: { sub: authUserId },
    method: "GET",
    routeOptions: {
      config: { tenantServiceAccess: "session" },
    },
  } as FastifyRequest;
}

describe("EmployeePermissionsController billing lock access", () => {
  test("allows current permission context while tenant billing is locked", async () => {
    const { default: controller } = await import(".");
    const request = buildRequest();

    const response = await controller.getMyPermissions(request, {} as never);

    expect(getRequiredAuthContext).toHaveBeenCalledWith(authUserId, {
      tenantServiceAccess: "session",
    });
    expect(request.authContext).toEqual(authContext);
    expect(response.data).toEqual(authContext);
  });
});

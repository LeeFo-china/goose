import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let projectCameraService: typeof import("@/services/project-cameras").projectCameraService;
let projectCameraRepository: typeof import("@/repositories/project-cameras").projectCameraRepository;
let authorizationService: typeof import("@/services/authorization").authorizationService;
let accessPolicyService: typeof import("@/services/access-policy").accessPolicyService;
let tencentIotVideoService: typeof import("@/services/tencent-iot-video").tencentIotVideoService;
beforeAll(async () => {
  ({ projectCameraService } = await import("@/services/project-cameras"));
  ({ projectCameraRepository } = await import("@/repositories/project-cameras"));
  ({ authorizationService } = await import("@/services/authorization"));
  ({ accessPolicyService } = await import("@/services/access-policy"));
  ({ tencentIotVideoService } = await import("@/services/tencent-iot-video"));
});
const tenantId = "00000000-0000-4000-8000-000000000001";
const projectId = "00000000-0000-4000-8000-000000000002";
const input = { authUserId: "auth", tenantServiceAccess: "read" as const,
  requiredCapability: "core.projects" as const, query: { page: 1, pageSize: 20, binding: "all" as const } };
const counts = { camera_count: 50, online_count: 30, offline_count: 12,
  unknown_count: 8, hidden_count: 4, tencent_count: 40 };
const group = { project: { id: projectId, name: "项目", label: "项目", status: "constructing",
  customer_name: null, phone_masked: null, address: null, property: null },
  cameras: [], summary: counts };
const result = { list: [group], pagination: { page: 1, pageSize: 20, total: 101, totalPages: 6 },
  summary: { project_count: 101, total_camera_count: 500, online_count: 300,
    offline_count: 120, unknown_count: 80, hidden_count: 40, tencent_count: 400 } };
afterEach(() => mock.restore());
function employee() {
  spyOn(authorizationService, "getRequiredAuthContext").mockResolvedValue({
    employeeId: "employee", tenantId,
  } as Awaited<ReturnType<typeof authorizationService.getRequiredAuthContext>>);
  spyOn(accessPolicyService, "assertTenantContext").mockReturnValue(tenantId);
}
describe("camera workspace service", () => {
  test("preserves full persisted summaries and never scans vendor devices", async () => {
    employee();
    const visible = spyOn(accessPolicyService, "getVisibleProjectIds").mockResolvedValue([projectId]);
    const repo = spyOn(projectCameraRepository, "listCameraProjectGroups").mockResolvedValue(result);
    const vendor = spyOn(tencentIotVideoService, "listDeviceChannels");
    expect(await projectCameraService.listCameraProjectGroups(input)).toEqual(result);
    expect(visible.mock.calls[0]?.[1]).toBe("project.read");
    expect(repo).toHaveBeenCalledWith({ ...input.query, tenantId, visibleProjectIds: [projectId] });
    expect(vendor).not.toHaveBeenCalled();
  });
  test("requires login and rejects customer-only identities before repository access", async () => {
    const repo = spyOn(projectCameraRepository, "listCameraProjectGroups");
    await expect(projectCameraService.listCameraProjectGroups({ ...input, authUserId: null }))
      .rejects.toThrow("缺少登录凭证");
    spyOn(authorizationService, "getRequiredAuthContext").mockResolvedValue({ employeeId: null } as Awaited<ReturnType<typeof authorizationService.getRequiredAuthContext>>);
    await expect(projectCameraService.listCameraProjectGroups(input)).rejects.toThrow("无权查看项目摄像头");
    expect(repo).not.toHaveBeenCalled();
  });
});

describe("employee-only expanded camera page", () => {
  const detailInput = { ...input, projectId, query: { page: 2, pageSize: 20 } };
  function detailAccess() {
    employee();
    spyOn(accessPolicyService, "hasPermission").mockReturnValue(true);
    spyOn(accessPolicyService, "canAccessProject").mockResolvedValue(true);
    spyOn(projectCameraRepository, "getProject").mockResolvedValue({ id: projectId, tenant_id: tenantId });
  }
  test("returns bounded persisted records with explicit status semantics", async () => {
    detailAccess();
    const page = { list: [{ id: "camera", vendor: "ezviz" as const, name: "摄像头",
      position: null, status: "offline" as const, can_view: false, can_control: false,
      capabilities: ["live", 5], cover_url: null, sort_order: 0, video_encrypted: false,
      play_protocol: "flv" as const, vendor_device_serial: "ezviz-device", vendor_channel_id: null,
      last_status_checked_at: null, last_status_error: null }],
      pagination: { page: 2, pageSize: 20, total: 45, totalPages: 3 } };
    const repo = spyOn(projectCameraRepository, "listCameraWorkspaceDevices").mockResolvedValue(page);
    const customer = spyOn(projectCameraRepository, "getCustomerOwnedProjectTenant");
    const vendor = spyOn(tencentIotVideoService, "listDeviceChannels");
    const result = await projectCameraService.listCameraWorkspaceDevices(detailInput);
    expect(repo).toHaveBeenCalledWith({ page: 2, pageSize: 20, tenantId, projectId });
    expect(result.list[0]?.capabilities).toEqual(["live"]);
    expect(result.list[0]?.can_view).toBe(false);
    expect(result.status_source).toBe("persisted");
    expect(result.pagination).toEqual(page.pagination);
    expect(customer).not.toHaveBeenCalled();
    expect(vendor).not.toHaveBeenCalled();
    expect(accessPolicyService.canAccessProject).toHaveBeenCalledWith(
      expect.anything(), projectId, "project.read",
    );
    expect(authorizationService.getRequiredAuthContext).toHaveBeenCalledWith("auth", {
      tenantServiceAccess: "read", requiredCapability: "core.projects",
    });
  });
  test("denies missing permission, inaccessible project and customer identity", async () => {
    detailAccess();
    const repo = spyOn(projectCameraRepository, "listCameraWorkspaceDevices");
    spyOn(accessPolicyService, "hasPermission").mockReturnValue(false);
    await expect(projectCameraService.listCameraWorkspaceDevices(detailInput)).rejects.toThrow("无权查看该项目摄像头");
    spyOn(accessPolicyService, "hasPermission").mockReturnValue(true);
    spyOn(accessPolicyService, "canAccessProject").mockResolvedValue(false);
    await expect(projectCameraService.listCameraWorkspaceDevices(detailInput)).rejects.toThrow("无权查看该项目摄像头");
    spyOn(authorizationService, "getRequiredAuthContext").mockResolvedValue({ employeeId: null } as Awaited<ReturnType<typeof authorizationService.getRequiredAuthContext>>);
    await expect(projectCameraService.listCameraWorkspaceDevices(detailInput)).rejects.toThrow("无权查看该项目摄像头");
    expect(repo).not.toHaveBeenCalled();
  });
  test("unknown project fails before loading cameras", async () => {
    detailAccess();
    spyOn(projectCameraRepository, "getProject").mockResolvedValue(null);
    const repo = spyOn(projectCameraRepository, "listCameraWorkspaceDevices");
    await expect(projectCameraService.listCameraWorkspaceDevices(detailInput)).rejects.toThrow("项目不存在");
    expect(repo).not.toHaveBeenCalled();
  });
});

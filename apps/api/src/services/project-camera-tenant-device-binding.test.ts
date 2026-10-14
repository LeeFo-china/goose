import { afterEach, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { CreateProjectCameraSchema } from "@/schema/project-cameras";
import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let mutations: typeof import("@/services/project-cameras/legacy/mutations");
let repository: typeof import("@/repositories/project-cameras").projectCameraRepository;
let assets: typeof import("@/repositories/tenant-devices").tenantDeviceRepository;
beforeAll(async () => {
  mutations = await import("@/services/project-cameras/legacy/mutations");
  ({ projectCameraRepository: repository } = await import("@/repositories/project-cameras"));
  ({ tenantDeviceRepository: assets } = await import("@/repositories/tenant-devices"));
});
afterEach(() => mock.restore());

const access = {
  authUserId: "auth", projectId: "project", tenantServiceAccess: "write" as const,
  requiredCapability: "core.projects" as const,
};
const expectedAccess = { ...access, permissionCode: "project.update", allowCustomer: false };
const payload = CreateProjectCameraSchema.parse({
  tenant_device_id: "11111111-1111-4111-8111-111111111111", name: "客厅",
  vendor: "tencent_iotvideo_industry", vendor_device_serial: "legacy-placeholder",
  vendor_channel_id: "legacy-placeholder",
});
const context = () => ({ resolveActor: mock(async () => ({ tenantId: "tenant", authContext: { employeeId: "employee" } })) });

describe("project camera tenant-device binding", () => {
  test("accepts a tenant device id while preserving legacy camera payloads", () => {
    expect(payload.tenant_device_id).toBe("11111111-1111-4111-8111-111111111111");
    const { tenant_device_id: _asset, ...legacy } = payload;
    expect(CreateProjectCameraSchema.parse(legacy).vendor_device_serial).toBe("legacy-placeholder");
  });

  test("propagates project write permission and sends the asset payload to one atomic binding call", async () => {
    const actor = context();
    const bind = spyOn(repository, "bindProjectCamera").mockResolvedValue({ id: "camera" });
    const legacyCreate = spyOn(repository, "create");
    const staleLookup = spyOn(assets, "findById");
    const secondWrite = spyOn(assets, "upsertFromProjectCamera");
    expect(await mutations.createProjectCamera.call(actor, { ...access, payload })).toEqual({ id: "camera" });
    expect(actor.resolveActor).toHaveBeenCalledWith(expectedAccess);
    expect(bind).toHaveBeenCalledTimes(1);
    expect(bind).toHaveBeenCalledWith({ tenantId: "tenant", projectId: "project", actorEmployeeId: "employee", payload });
    expect(legacyCreate).not.toHaveBeenCalled();
    expect(staleLookup).not.toHaveBeenCalled();
    expect(secondWrite).not.toHaveBeenCalled();
    // Trusted asset identity resolution is exercised against PostgreSQL in binding-sql.test.ts.
  });

  test("unbind propagates permission and releases occupation through one atomic call", async () => {
    const actor = context();
    const unbind = spyOn(repository, "unbindProjectCamera").mockResolvedValue({ id: "camera" });
    const legacyDelete = spyOn(repository, "softDelete");
    const secondWrite = spyOn(assets, "markUnboundByCameraId");
    expect(await mutations.deleteProjectCamera.call(actor, { ...access, cameraId: "camera" })).toEqual({ success: true });
    expect(actor.resolveActor).toHaveBeenCalledWith(expectedAccess);
    expect(unbind).toHaveBeenCalledTimes(1);
    expect(unbind).toHaveBeenCalledWith({ tenantId: "tenant", projectId: "project", actorEmployeeId: "employee", cameraId: "camera" });
    expect(legacyDelete).not.toHaveBeenCalled();
    expect(secondWrite).not.toHaveBeenCalled();
  });

  test("denied project access and missing tenant prevent both mutations", async () => {
    const bind = spyOn(repository, "bindProjectCamera");
    const unbind = spyOn(repository, "unbindProjectCamera");
    const denied = { resolveActor: mock(async () => { throw Errors.forbidden(); }) };
    await expect(mutations.createProjectCamera.call(denied, { ...access, payload })).rejects.toMatchObject({ statusCode: 403 });
    await expect(mutations.deleteProjectCamera.call(denied, { ...access, cameraId: "camera" })).rejects.toMatchObject({ statusCode: 403 });
    const noTenant = { resolveActor: mock(async () => ({ tenantId: null })) };
    await expect(mutations.createProjectCamera.call(noTenant, { ...access, payload })).rejects.toMatchObject({ statusCode: 403, code: "CAMERA_ACCESS_DENIED" });
    await expect(mutations.deleteProjectCamera.call(noTenant, { ...access, cameraId: "camera" })).rejects.toMatchObject({ statusCode: 403, code: "CAMERA_ACCESS_DENIED" });
    expect(bind).not.toHaveBeenCalled();
    expect(unbind).not.toHaveBeenCalled();
  });

  test("transaction failures reach the caller without a second asset write", async () => {
    const failure = Errors.dbError("事务失败", { code: "23503" });
    spyOn(repository, "bindProjectCamera").mockRejectedValue(failure);
    spyOn(repository, "unbindProjectCamera").mockRejectedValue(failure);
    const claim = spyOn(assets, "upsertFromProjectCamera");
    const release = spyOn(assets, "markUnboundByCameraId");
    await expect(mutations.createProjectCamera.call(context(), { ...access, payload })).rejects.toBe(failure);
    await expect(mutations.deleteProjectCamera.call(context(), { ...access, cameraId: "camera" })).rejects.toBe(failure);
    expect(claim).not.toHaveBeenCalled();
    expect(release).not.toHaveBeenCalled();
  });
});

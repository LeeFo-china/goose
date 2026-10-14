import { expect, test } from "bun:test";
import { bindProjectCamera, unbindProjectCamera } from "./binding";
import { CreateProjectCameraSchema } from "@/schema/project-cameras";

const payload = CreateProjectCameraSchema.parse({ name: "门口", vendor_device_serial: "cloud-device" });
const input = { tenantId: "tenant", projectId: "project", actorEmployeeId: "employee", payload };

test("binding sends the complete legacy payload in one RPC", async () => {
  const calls: unknown[] = [];
  const client = { rpc: async (...args: unknown[]) => { calls.push(args); return { data: { id: "camera" }, error: null }; } };
  expect(await bindProjectCamera(client, input)).toEqual({ id: "camera" });
  expect(calls).toEqual([["bind_project_camera", {
    p_tenant_id: "tenant", p_project_id: "project", p_actor_employee_id: "employee", p_payload: payload,
  }]]);
});

test("asset ID payload reaches the transaction without stale service resolution", async () => {
  const withAsset = { ...payload, tenant_device_id: "asset" };
  const client = { rpc: async (_name: string, args: Record<string, unknown>) => {
    expect(args.p_payload).toEqual(withAsset);
    return { data: { id: "camera" }, error: null };
  } };
  await bindProjectCamera(client, { ...input, payload: withAsset });
});

test("unbind scopes the camera and releases its asset in one RPC", async () => {
  const client = { rpc: async (name: string, args: Record<string, unknown>) => {
    expect(name).toBe("unbind_project_camera");
    expect(args).toEqual({ p_tenant_id: "tenant", p_project_id: "project", p_camera_id: "camera", p_actor_employee_id: null });
    return { data: { id: "camera" }, error: null };
  } };
  await unbindProjectCamera(client, { tenantId: "tenant", projectId: "project", cameraId: "camera" });
});

for (const [sqlCode, statusCode, code] of [
  ["PCA01", 404, "PROJECT_NOT_FOUND"], ["PCA02", 404, "CAMERA_NOT_FOUND"],
  ["PCA03", 400, "VALIDATION_ERROR"], ["PCA04", 409, "CAMERA_ALREADY_BOUND"],
  ["PCA05", 409, "CAMERA_BOUND_TO_ANOTHER_PROJECT"],
  ["PCA06", 409, "TENCENT_IOT_VIDEO_PLAY_URL_ERROR"],
  ["PCA07", 409, "CAMERA_ALREADY_BOUND"],
] as const) {
  test(`transaction ${sqlCode} preserves business error contract`, async () => {
    const client = { rpc: async () => ({ data: null, error: { code: sqlCode, message: "业务错误" } }) };
    await expect(bindProjectCamera(client, input)).rejects.toMatchObject({ statusCode, code });
  });
}

for (const index of ["uniq_project_cameras_ezviz_device_channel", "uniq_project_cameras_tencent_device_channel", "tenant_devices_vendor_device_channel_unique"]) {
  test(`${index} becomes a 409`, async () => {
    const client = { rpc: async () => ({ data: null, error: { code: "23505", message: `duplicate key value violates unique constraint "${index}"` } }) };
    await expect(bindProjectCamera(client, input)).rejects.toMatchObject({ statusCode: 409, code: "CAMERA_ALREADY_BOUND" });
  });
}

for (const error of [{ code: "23503", message: "foreign key failure" }, { code: "23505", message: 'duplicate key value violates unique constraint "unrelated_index"' }, { code: "P0001", message: "injected storage failure" }]) {
  test(`unexpected database error ${error.code}/${error.message} remains a 500 with details`, async () => {
    const client = { rpc: async () => ({ data: null, error }) };
    await expect(bindProjectCamera(client, input)).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: error });
    await expect(unbindProjectCamera(client, { ...input, cameraId: "camera" })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: error });
  });
}

import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let refresh: typeof import("./workspace-status").refreshWorkspaceCameraStatuses;
let repository: typeof import("@/repositories/project-cameras").projectCameraRepository;
let vendor: typeof import("@/services/tencent-iot-video").tencentIotVideoService;
beforeAll(async () => {
  ({ refreshWorkspaceCameraStatuses: refresh } = await import("./workspace-status"));
  ({ projectCameraRepository: repository } = await import("@/repositories/project-cameras"));
  ({ tencentIotVideoService: vendor } = await import("@/services/tencent-iot-video"));
});
afterEach(() => mock.restore());
const camera = { id: "camera", vendor: "tencent_iotvideo_industry" as const, name: "监控",
  vendor_device_serial: "d1", vendor_channel_id: "c1", status: "offline" as const,
  position: null, can_view: true, can_control: false, capabilities: ["live"],
  cover_url: null, sort_order: 0, video_encrypted: false, play_protocol: "flv" as const,
  last_status_checked_at: null, last_status_error: null };
const scope = { tenantId: "tenant", projectId: "project" };
test("stale offline cameras can become live online and persist within authorized scope", async () => {
  spyOn(vendor, "getWorkspaceChannelStatuses").mockResolvedValue([
    { deviceId: "d1", channelId: "c1", status: "online" },
  ]);
  const save = spyOn(repository, "saveWorkspaceStatuses").mockResolvedValue(["camera"]);
  const result = await refresh([camera], scope);
  expect(result.status_source).toBe("live");
  expect(result.list[0]?.status).toBe("online");
  expect(result.list[0]?.status_source).toBe("live");
  expect(result.list[0]).not.toHaveProperty("vendor_device_serial");
  expect(save).toHaveBeenCalledWith({ ...scope, checkedAt: expect.any(String), signal: expect.any(AbortSignal),
    statuses: [{ cameraId: "camera", status: "online" }] });
});
test("recent status uses existing timestamp without querying vendor or updating database", async () => {
  const call = spyOn(vendor, "getWorkspaceChannelStatuses");
  const save = spyOn(repository, "saveWorkspaceStatuses");
  const checked = new Date().toISOString();
  const result = await refresh([{ ...camera, last_status_checked_at: checked }], scope);
  expect(result.status_source).toBe("cached");
  expect(result.list[0]?.last_status_checked_at).toBe(checked);
  expect(call).not.toHaveBeenCalled();
  expect(save).not.toHaveBeenCalled();
});
test("vendor missing/failed targets preserve persisted status and time, mixed results are explicit", async () => {
  spyOn(vendor, "getWorkspaceChannelStatuses").mockResolvedValue([
    { deviceId: "d1", channelId: "c1", status: "online" },
  ]);
  spyOn(repository, "saveWorkspaceStatuses").mockResolvedValue(["camera"]);
  const result = await refresh([camera, { ...camera, id: "other", vendor_channel_id: "missing" }], scope);
  expect(result.status_source).toBe("mixed");
  expect(result.list[1]?.status).toBe("offline");
  expect(result.list[1]?.status_source).toBe("persisted");
  expect(result.list[1]?.last_status_checked_at).toBeNull();
});
test("write failure leaves persisted response instead of claiming successful refresh", async () => {
  const { Errors } = await import("@/errors/error-factory");
  spyOn(vendor, "getWorkspaceChannelStatuses").mockResolvedValue([
    { deviceId: "d1", channelId: "c1", status: "online" },
  ]);
  spyOn(repository, "saveWorkspaceStatuses").mockRejectedValue(Errors.dbError("写入失败"));
  const result = await refresh([camera], scope);
  expect(result.status_source).toBe("persisted");
  expect(result.list[0]?.status).toBe("offline");
});
test("non-Tencent remains persisted and stale/error timestamps do not block Tencent refresh", async () => {
  const call = spyOn(vendor, "getWorkspaceChannelStatuses").mockResolvedValue([]);
  const result = await refresh([
    { ...camera, vendor: "ezviz", id: "ezviz", last_status_checked_at: new Date().toISOString() },
    { ...camera, id: "old", last_status_checked_at: new Date(Date.now() - 31_000).toISOString() },
    { ...camera, id: "failed", last_status_checked_at: new Date().toISOString(), last_status_error: "timeout" },
  ], scope);
  expect(call).toHaveBeenCalledWith([
    { deviceId: "d1", channelId: "c1" }, { deviceId: "d1", channelId: "c1" },
  ], { signal: expect.any(AbortSignal) });
  expect(result.list.every((row) => row.status_source === "persisted")).toBe(true);
});
test("successful unchanged status still renews freshness timestamp", async () => {
  spyOn(vendor, "getWorkspaceChannelStatuses").mockResolvedValue([
    { deviceId: "d1", channelId: "c1", status: "offline" },
  ]);
  const save = spyOn(repository, "saveWorkspaceStatuses").mockResolvedValue(["camera"]);
  const result = await refresh([camera], scope);
  expect(save).toHaveBeenCalledTimes(1);
  expect(result.list[0]?.last_status_checked_at).toBeString();
  expect(result.status_source).toBe("live");
});
test("one 8s budget includes an uncooperative vendor and prevents late saves", async () => {
  const timeout = await import("@/utils/abortable-module-timeout");
  const original = timeout.withAbortableModuleTimeout;
  const budget = spyOn(timeout, "withAbortableModuleTimeout").mockImplementation((options) =>
    original({ ...options, timeoutMs: 20 }));
  let finish!: (value: Awaited<ReturnType<typeof vendor.getWorkspaceChannelStatuses>>) => void;
  spyOn(vendor, "getWorkspaceChannelStatuses").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const save = spyOn(repository, "saveWorkspaceStatuses").mockResolvedValue([]);
  const result = await Promise.race([refresh([camera], scope), Bun.sleep(150).then(() => null)]);
  finish([{ deviceId: "d1", channelId: "c1", status: "online" }]);
  await Bun.sleep(10);
  expect(result?.status_source).toBe("persisted");
  expect(budget.mock.calls[0]?.[0].timeoutMs).toBe(8_000);
  expect(save).not.toHaveBeenCalled();
});
test("same budget includes database waiting and never accepts its late result", async () => {
  const timeout = await import("@/utils/abortable-module-timeout");
  const original = timeout.withAbortableModuleTimeout;
  spyOn(timeout, "withAbortableModuleTimeout").mockImplementation((options) => original({ ...options, timeoutMs: 20 }));
  spyOn(vendor, "getWorkspaceChannelStatuses").mockResolvedValue([{ deviceId: "d1", channelId: "c1", status: "online" }]);
  let finish!: (ids: string[]) => void;
  const save = spyOn(repository, "saveWorkspaceStatuses").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const result = await Promise.race([refresh([camera], scope), Bun.sleep(150).then(() => null)]);
  finish(["camera"]);
  await Bun.sleep(10);
  expect(result?.status_source).toBe("persisted");
  expect(save.mock.calls[0]?.[0].signal.aborted).toBe(true);
});
test("observation time is request start, not late vendor response time; CAS rejection is persisted", async () => {
  const started = Date.now();
  spyOn(vendor, "getWorkspaceChannelStatuses").mockImplementation(async () => {
    await Bun.sleep(30);
    return [{ deviceId: "d1", channelId: "c1", status: "online" }];
  });
  const save = spyOn(repository, "saveWorkspaceStatuses").mockResolvedValue([]);
  const result = await refresh([camera], scope);
  expect(Date.parse(save.mock.calls[0]![0].checkedAt)).toBeLessThan(started + 20);
  expect(result.status_source).toBe("persisted");
});

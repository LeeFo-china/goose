import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import type { TenantDeviceRow } from "@/repositories/tenant-devices";
import { TenantDeviceChannelsQuerySchema, TenantDeviceSyncPageQuerySchema } from "@/schema/tenant-devices";
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
let subject: typeof import("./channel-page");
let assets: typeof import("@/repositories/tenant-devices").tenantDeviceRepository;
let channels: typeof import("@/repositories/tenant-devices/channel-page").tenantDeviceChannelRepository;
let gateway: typeof import("@/gateways/tencent-iot-video/channel-page").tenantDeviceChannelGateway;
beforeAll(async () => {
  subject = await import("./channel-page");
  ({ tenantDeviceRepository: assets } = await import("@/repositories/tenant-devices"));
  ({ tenantDeviceChannelRepository: channels } = await import("@/repositories/tenant-devices/channel-page"));
  ({ tenantDeviceChannelGateway: gateway } = await import("@/gateways/tencent-iot-video/channel-page"));
});
afterEach(() => mock.restore());
const auth = { tenantId: "tenant", employeeId: "employee", permissions: [
  { code: "project.read", scope: "all" }, { code: "project.update", scope: "all" },
] } as AuthContext;
const device = { id: "root", tenant_id: "tenant", vendor: "tencent_iotvideo_industry",
  vendor_device_serial: "cloud" } as TenantDeviceRow;
const input = { authContext: auth, id: "root", query: { page: 1, pageSize: 20 } };
test("sync page checks tenant scope then persists once and reports continuation", async () => {
  const find = spyOn(assets, "findById").mockResolvedValue(device);
  const read = spyOn(gateway, "readPage").mockResolvedValue({ channels: [], total: 21, hasMore: true });
  const save = spyOn(channels, "sync").mockResolvedValue({ synced_count: 0 });
  const result = await subject.syncTenantDevicePage(input);
  expect(find).toHaveBeenCalledWith("root", "tenant");
  expect(read.mock.calls[0]?.slice(0,2)).toEqual(["cloud", input.query]);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0]?.[0]).toMatchObject({ tenantId: "tenant", assetId: "root", employeeId: "employee" });
  expect(result.sync).toMatchObject({ has_more: true, next_page: 2, state: "partial" });
});
test("zero channels is waiting, cloud failure is an error and never persists", async () => {
  spyOn(assets, "findById").mockResolvedValue(device);
  const read = spyOn(gateway, "readPage").mockResolvedValue({ channels: [], total: 0, hasMore: false });
  const save = spyOn(channels, "sync").mockResolvedValue({ synced_count: 0 });
  expect((await subject.syncTenantDevicePage(input)).sync.state).toBe("waiting_for_device");
  save.mockClear(); read.mockRejectedValue({ code: "VENDOR_FAILURE" });
  await expect(subject.syncTenantDevicePage(input)).rejects.toMatchObject({ code: "VENDOR_FAILURE" });
  expect(save).not.toHaveBeenCalled();
});
test("customer and read-only identities cannot sync or trigger vendor calls", async () => {
  const find = spyOn(assets, "findById");
  for (const authContext of [{ ...auth, employeeId: null }, { ...auth, permissions: [{ code: "project.read", scope: "all" as const }] }]) {
    await expect(subject.syncTenantDevicePage({ ...input, authContext })).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(find).not.toHaveBeenCalled();
});
test("foreign or missing asset cannot trigger a vendor request", async () => {
  spyOn(assets, "findById").mockResolvedValue(null);
  const read = spyOn(gateway, "readPage");
  await expect(subject.syncTenantDevicePage(input)).rejects.toMatchObject({ statusCode: 404 });
  expect(read).not.toHaveBeenCalled();
});
test("channel list carries exact owned device and page bounds", async () => {
  spyOn(assets, "findById").mockResolvedValue(device);
  const list = spyOn(channels, "list").mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } });
  await subject.listTenantDeviceChannels(input);
  expect(list.mock.calls[0]?.slice(0,2)).toEqual([device, input.query]);
  expect(TenantDeviceSyncPageQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
  expect(TenantDeviceChannelsQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
  expect(TenantDeviceSyncPageQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
});

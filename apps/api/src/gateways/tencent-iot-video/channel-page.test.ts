import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
import type { DescribeChannelsResponse } from "./shared";
const pageResponse = (value: DescribeChannelsResponse): DescribeChannelsResponse => value;
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-role";
let gateway: typeof import("./channel-page").tenantDeviceChannelGateway;
let transport: typeof import("./request");
beforeAll(async () => {
  transport = await import("./request");
  ({ tenantDeviceChannelGateway: gateway } = await import("./channel-page"));
});
afterEach(() => mock.restore());
test("one device and one bounded vendor page; preserves explicit continuation", async () => {
  const call = spyOn(transport, "request").mockResolvedValue(pageResponse({ TotalCount: 21,
    Channels: [{ DeviceId: "cloud", ChannelId: "c21", ChannelName: "客厅", Status: 1 }] }));
  const result = await gateway.readPage("cloud", { page: 2, pageSize: 20 }, AbortSignal.timeout(1000));
  expect(call).toHaveBeenCalledTimes(1);
  expect(call.mock.calls[0]?.slice(0,2)).toEqual(["DescribeChannels", {
    DeviceId: "cloud", Offset: 20, Limit: 20, ChannelTypes: [1],
  }]);
  expect(result.channels[0]?.channel_id).toBe("c21");
  expect(result.hasMore).toBe(false);
});
test("cross-device vendor response fails closed before persistence", async () => {
  spyOn(transport, "request").mockResolvedValue(pageResponse({ Channels: [{ DeviceId: "other", ChannelId: "bad" }] }));
  await expect(gateway.readPage("cloud", { page: 1, pageSize: 20 }, AbortSignal.timeout(1000)))
    .rejects.toMatchObject({ code: "TENCENT_DEVICE_CHANNEL_RESPONSE_INVALID" });
});
test("does not treat failed cloud reads as an empty successful sync", async () => {
  spyOn(transport, "request").mockRejectedValue({ code: "VENDOR_FAILURE" });
  await expect(gateway.readPage("cloud", { page: 1, pageSize: 20 }, AbortSignal.timeout(1000)))
    .rejects.toMatchObject({ code: "VENDOR_FAILURE" });
});
test("full vendor page without total asks for another page", async () => {
  spyOn(transport, "request").mockResolvedValue(pageResponse({ Channels: [{ ChannelId: "c1" }] }));
  const result = await gateway.readPage("cloud", { page: 1, pageSize: 1 }, AbortSignal.timeout(1000));
  expect(result.hasMore).toBe(true);
});

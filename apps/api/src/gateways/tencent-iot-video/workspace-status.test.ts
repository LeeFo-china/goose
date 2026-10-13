import type { DescribeChannelsResponse } from "./shared";
import { afterEach, beforeAll, expect, mock, spyOn, test } from "bun:test";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let gateway: typeof import("./request");
let statuses: typeof import("./workspace-status");
beforeAll(async () => {
  gateway = await import("./request");
  statuses = await import("./workspace-status");
});
afterEach(() => mock.restore());
test("queries only bound devices, deduplicates, stops when requested channels are found", async () => {
  const request = spyOn(gateway, "request").mockResolvedValue({ Channels: [
    { ChannelId: "c1", Status: 3 }, { ChannelId: "unrelated", Status: 0 },
  ], TotalCount: 1000 } as DescribeChannelsResponse);
  const result = await statuses.getWorkspaceChannelStatuses([
    { deviceId: "d1", channelId: "c1" }, { deviceId: "d1", channelId: "c1" },
  ]);
  expect(result).toEqual([{ deviceId: "d1", channelId: "c1", status: "online" }]);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0]?.slice(0, 2)).toEqual([
    "DescribeChannels", { DeviceId: "d1", Offset: 0, Limit: 50, ChannelTypes: [1] },
  ]);
});
test("shares a hard 20 request budget, with no device-pool scan", async () => {
  const request = spyOn(gateway, "request").mockResolvedValue({
    Channels: Array.from({ length: 50 }, (_, i) => ({ ChannelId: `other${i}`, Status: 1 })), TotalCount: 99999,
  } as DescribeChannelsResponse);
  const result = await statuses.getWorkspaceChannelStatuses(
    Array.from({ length: 20 }, (_, i) => ({ deviceId: `d${i}`, channelId: `target${i}` })),
  );
  expect(result).toEqual([]);
  expect(request).toHaveBeenCalledTimes(20);
  expect(new Set(request.mock.calls.map((call) => call[1].DeviceId)).size).toBe(20);
  expect(request.mock.calls.every((call) => call[0] === "DescribeChannels")).toBe(true);
});
test("pages a single NVR until the bound channel is found", async () => {
  const request = spyOn(gateway, "request")
    .mockResolvedValueOnce({ Channels: Array.from({ length: 50 }, () => ({ ChannelId: "other", Status: 1 })), TotalCount: 51 } as DescribeChannelsResponse)
    .mockResolvedValueOnce({ Channels: [{ ChannelId: "target", Status: 0 }], TotalCount: 51 } as DescribeChannelsResponse);
  expect(await statuses.getWorkspaceChannelStatuses([{ deviceId: "d1", channelId: "target" }]))
    .toEqual([{ deviceId: "d1", channelId: "target", status: "offline" }]);
  expect(request.mock.calls[1]?.[1].Offset).toBe(50);
});
test("one failed device does not discard successful device results", async () => {
  const { Errors } = await import("@/errors/error-factory");
  spyOn(gateway, "request").mockRejectedValueOnce(Errors.dbError("vendor timeout"))
    .mockResolvedValueOnce({ Channels: [{ ChannelId: "c2", Status: 1 }], TotalCount: 1 } as DescribeChannelsResponse);
  expect(await statuses.getWorkspaceChannelStatuses([
    { deviceId: "d1", channelId: "c1" }, { deviceId: "d2", channelId: "c2" },
  ])).toEqual([{ deviceId: "d2", channelId: "c2", status: "online" }]);
});
test("caps concurrency at four and forwards a timeout signal to every request", async () => {
  let active = 0;
  let peak = 0;
  const request = spyOn(gateway, "request").mockImplementation((async () => {
    active++;
    peak = Math.max(peak, active);
    await Bun.sleep(2);
    active--;
    return { Channels: [], TotalCount: 0 };
  }) as typeof gateway.request);
  await statuses.getWorkspaceChannelStatuses(Array.from({ length: 20 }, (_, i) => ({
    deviceId: `d${i}`, channelId: `c${i}`,
  })));
  expect(peak).toBe(4);
  expect(request.mock.calls.every((call) => call[2]?.signal instanceof AbortSignal)).toBe(true);
});
test("expired refresh deadline starts no new vendor calls", async () => {
  spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort());
  const request = spyOn(gateway, "request");
  expect(await statuses.getWorkspaceChannelStatuses([{ deviceId: "d", channelId: "c" }])).toEqual([]);
  expect(request).not.toHaveBeenCalled();
});

import { assertNotAborted, waitForSignal } from "@/utils/abortable-wait";
import { request } from "./request";
import { Errors, PAGE_SIZE, normalizeStatus, type DescribeChannelsResponse } from "./shared";

export type WorkspaceChannelTarget = { deviceId: string; channelId: string };
export type WorkspaceChannelStatus = WorkspaceChannelTarget & {
  status: "online" | "offline" | "unknown";
};
const MAX_WORKSPACE_REQUESTS = 20;
const MAX_CONCURRENCY = 4;
const REFRESH_TIMEOUT_MS = 8_000;

/** DescribeChannels accepts DeviceId/Offset/Limit, not arbitrary ChannelIds.
 * https://cloud.tencent.com/document/product/1361/67429
 * Only the <=20 bound targets are returned. Unresolved targets retain persisted
 * status in the service; reaching a budget is never evidence of being offline.
 */
export async function getWorkspaceChannelStatuses(
  targets: WorkspaceChannelTarget[],
  options: { signal?: AbortSignal } = {},
): Promise<WorkspaceChannelStatus[]> {
  if (targets.length > 20) throw Errors.badRequest("状态刷新每次最多 20 条");
  const devices = new Map<string, Set<string>>();
  for (const target of targets) {
    const channels = devices.get(target.deviceId) || new Set<string>();
    channels.add(target.channelId);
    devices.set(target.deviceId, channels);
  }
  const queue = Array.from(devices, ([deviceId, pending]) => ({ deviceId, pending, offset: 0 }));
  const statuses: WorkspaceChannelStatus[] = [];
  const signal = options.signal || AbortSignal.timeout(REFRESH_TIMEOUT_MS);
  let remaining = MAX_WORKSPACE_REQUESTS;
  async function worker() {
    while (queue.length && remaining > 0 && !signal.aborted) {
      const device = queue.shift();
      if (!device) return;
      remaining--;
      try {
        const response = await waitForSignal(request<DescribeChannelsResponse>("DescribeChannels", {
          DeviceId: device.deviceId, Offset: device.offset,
          Limit: PAGE_SIZE, ChannelTypes: [1],
        }, { signal }), signal);
        assertNotAborted(signal);
        const channels = Array.isArray(response.Channels) ? response.Channels : [];
        for (const channel of channels) {
          if (!channel.ChannelId || !device.pending.has(channel.ChannelId)
            || (channel.DeviceId && channel.DeviceId !== device.deviceId)
            || channel.Status == null) continue;
          statuses.push({ deviceId: device.deviceId, channelId: channel.ChannelId,
            status: normalizeStatus(channel.Status) });
          device.pending.delete(channel.ChannelId);
        }
        device.offset += PAGE_SIZE;
        if (device.pending.size && channels.length === PAGE_SIZE
          && (response.TotalCount == null || device.offset < response.TotalCount)) {
          queue.push(device);
        }
      } catch {
        // This device failed: omit it so the caller returns persisted status,
        // explicitly marked as a fallback, while other devices can still refresh.
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENCY, queue.length) }, worker));
  return statuses;
}

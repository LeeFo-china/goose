import { Errors } from "@/errors/error-factory";
import { waitForSignal } from "@/utils/abortable-wait";
import { request } from "./request";
import { normalizeStatus, readString, type DescribeChannelsResponse } from "./shared";

export type SyncedDeviceChannel = {
  channel_id: string;
  channel_code: string | null;
  channel_name: string;
  status: "online" | "offline" | "unknown";
  raw_status: string | null;
};

export const tenantDeviceChannelGateway = {
  async readPage(deviceId: string, page: { page: number; pageSize: number }, signal: AbortSignal) {
    // Use the same DescribeChannels fields as the existing verified workspace gateway.
    const response = await waitForSignal(request<DescribeChannelsResponse>("DescribeChannels", {
      DeviceId: deviceId, Offset: (page.page - 1) * page.pageSize,
      Limit: page.pageSize, ChannelTypes: [1],
    }, { signal }), signal);
    if (!Array.isArray(response.Channels) || response.Channels.length > page.pageSize) {
      throw Errors.business(502, "设备通道响应无效，请重试", "TENCENT_DEVICE_CHANNEL_RESPONSE_INVALID");
    }
    const ids = new Set<string>();
    const channels: SyncedDeviceChannel[] = response.Channels.map((channel) => {
      const id = readString(channel.ChannelId);
      if (!id || ids.has(id) || (channel.DeviceId && channel.DeviceId !== deviceId)) {
        throw Errors.business(502, "设备通道响应无效，请重试", "TENCENT_DEVICE_CHANNEL_RESPONSE_INVALID");
      }
      ids.add(id);
      return { channel_id: id, channel_code: readString(channel.ChannelCode),
        channel_name: readString(channel.ChannelName) || readString(channel.ChannelCode) || id,
        status: normalizeStatus(channel.Status ?? null),
        raw_status: channel.Status == null ? null : String(channel.Status) };
    });
    const total = typeof response.TotalCount === "number" && Number.isInteger(response.TotalCount)
      && response.TotalCount >= 0 ? response.TotalCount : null;
    const offset = (page.page - 1) * page.pageSize;
    if (total !== null && (total > offset + channels.length && channels.length < page.pageSize)) {
      throw Errors.business(502, "设备通道分页结果不完整，请重试", "TENCENT_DEVICE_CHANNEL_RESPONSE_INVALID");
    }
    return { channels, total,
      hasMore: total === null ? channels.length === page.pageSize : offset + channels.length < total };
  },
};

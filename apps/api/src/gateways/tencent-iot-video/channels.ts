import { listDevices } from "./devices";
import { request } from "./request";
import {
  MAX_PAGES,
  PAGE_SIZE,
  normalizeStatus,
  readString,
  type DescribeChannelsResponse,
  type TencentChannelRecord,
  type TencentIotVideoDeviceChannel,
} from "./shared";

export async function listChannels(deviceId: string) {
  const channels: TencentChannelRecord[] = [];

  for (let offset = 0; offset < MAX_PAGES * PAGE_SIZE; offset += PAGE_SIZE) {
    const response = await request<DescribeChannelsResponse>(
      "DescribeChannels",
      {
        DeviceId: deviceId,
        Offset: offset,
        Limit: PAGE_SIZE,
        ChannelTypes: [1],
      },
    );
    const pageChannels = Array.isArray(response.Channels) ? response.Channels : [];
    channels.push(...pageChannels);

    const total = typeof response.TotalCount === "number" ? response.TotalCount : null;
    if (pageChannels.length < PAGE_SIZE || (total !== null && channels.length >= total)) {
      break;
    }
  }

  return channels;
}

export async function listDeviceChannels(
  keyword?: string | null,
): Promise<TencentIotVideoDeviceChannel[]> {
  const devices = await listDevices(keyword);
  const rows: TencentIotVideoDeviceChannel[] = [];

  for (const device of devices) {
    const deviceId = readString(device.DeviceId);
    if (!deviceId) continue;

    const channels = await listChannels(deviceId);
    for (const channel of channels) {
      const channelId = readString(channel.ChannelId);
      if (!channelId) continue;

      const rawStatus = channel.Status ?? device.Status ?? null;
      const deviceName =
        readString(device.NickName) ||
        readString(device.ExtraInformation) ||
        readString(device.DeviceCode);
      const channelName =
        readString(channel.ChannelName) ||
        readString(channel.ExtraInformation) ||
        readString(channel.ChannelCode) ||
        deviceName ||
        channelId;
      rows.push({
        device_id: deviceId,
        device_code: readString(device.DeviceCode),
        device_name: deviceName,
        device_type: typeof device.DeviceType === "number" ? device.DeviceType : null,
        channel_id: channelId,
        channel_code: readString(channel.ChannelCode),
        channel_name: channelName,
        channel_type: typeof channel.ChannelType === "number" ? channel.ChannelType : null,
        status: normalizeStatus(rawStatus),
        raw_status: rawStatus,
        protocol: readString(device.Protocol),
        group_id: readString(device.GroupId),
        group_name: readString(device.GroupName),
      });
    }
  }

  return rows;
}

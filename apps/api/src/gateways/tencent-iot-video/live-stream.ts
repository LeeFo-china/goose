import { request } from "./request";
import {
  ErrorCodes,
  Errors,
  readString,
  systemSettingsService,
  type DescribeChannelLiveStreamURLResponse,
  type TencentIotVideoLiveStream,
} from "./shared";

export async function getLiveStreamUrl(input: {
  deviceId: string;
  channelId: string;
}): Promise<TencentIotVideoLiveStream> {
  const preferredAction = await systemSettingsService.getString(
    "TENCENT_IOT_VIDEO_LIVE_STREAM_ACTION",
    "DescribeChannelLiveStreamURL",
  );
  const actions = Array.from(new Set([
    preferredAction,
    "DescribeChannelStreamURL",
  ])).filter(Boolean);
  let lastError: unknown;

  for (const action of actions) {
    try {
      const response = await request<DescribeChannelLiveStreamURLResponse>(
        action,
        {
          DeviceId: input.deviceId,
          ChannelId: input.channelId,
          ExpireTime: 0,
        },
      );

      return {
        request_id: response.RequestId || null,
        rtmp_url: readString(response.Data?.RtmpAddr),
        hls_url: readString(response.Data?.HlsAddr),
        flv_url: readString(response.Data?.FlvAddr),
        rtsp_url: readString(response.Data?.RtspAddr),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : Errors.business(
      503,
      "腾讯云播放地址获取失败",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
    );
}

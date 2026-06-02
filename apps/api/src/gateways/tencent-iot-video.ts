import {
  createDevice,
  deleteDevice,
  findDeviceSummary,
  getDevicePassword,
  getSipServerConfig,
  listDeviceSummaries,
  listDevices,
  updateDevicePassword,
} from "./tencent-iot-video/devices";
import {
  listChannels,
  listDeviceChannels,
} from "./tencent-iot-video/channels";
import { getLiveStreamUrl } from "./tencent-iot-video/live-stream";

export type {
  TencentIotVideoCreatedDevice,
  TencentIotVideoDeleteDeviceResult,
  TencentIotVideoDevice,
  TencentIotVideoDeviceChannel,
  TencentIotVideoDevicePassword,
  TencentIotVideoLiveStream,
  TencentIotVideoPasswordUpdate,
  TencentIotVideoSipServerConfig,
} from "./tencent-iot-video/shared";

export class TencentIotVideoService {
  listDevices = listDevices;
  listDeviceSummaries = listDeviceSummaries;
  findDeviceSummary = findDeviceSummary;
  getSipServerConfig = getSipServerConfig;
  createDevice = createDevice;
  getDevicePassword = getDevicePassword;
  updateDevicePassword = updateDevicePassword;
  deleteDevice = deleteDevice;
  listChannels = listChannels;
  listDeviceChannels = listDeviceChannels;
  getLiveStreamUrl = getLiveStreamUrl;
}

export const tencentIotVideoService = new TencentIotVideoService();

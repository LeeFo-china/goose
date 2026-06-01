import type { CameraDeviceChannel } from "@/components/cameras/camera-types";
import type { CameraMode } from "@/components/cameras/camera-mutation-types";
import {
  buildDeviceKey,
  parseDeviceKey,
  requestCamera,
  toBoolean,
  type CameraFormValues,
} from "@/components/cameras/camera-mutation-shared";

function buildCommonCameraPayload(values: CameraFormValues) {
  return {
    name: values.name.trim(),
    position: values.position.trim() || null,
    can_view: toBoolean(values.can_view),
    can_control: toBoolean(values.can_control),
    capabilities: values.capabilities,
    cover_url: values.cover_url.trim() || null,
    sort_order: Number(values.sort_order || 0),
    remark: values.remark.trim() || null,
    video_encrypted: toBoolean(values.video_encrypted),
    play_protocol: values.play_protocol,
  };
}

function buildCreateCameraPayload(
  values: CameraFormValues,
  availableDevices: CameraDeviceChannel[],
) {
  const commonPayload = buildCommonCameraPayload(values);
  const device = parseDeviceKey(values.device_key);

  if (device.vendor === "tencent_iotvideo_industry") {
    const selectedDevice = availableDevices.find(
      (item) => buildDeviceKey(item) === values.device_key,
    );

    return {
      ...commonPayload,
      vendor: "tencent_iotvideo_industry",
      vendor_device_serial: device.deviceId,
      vendor_channel_id: device.channelId,
      vendor_device_code: selectedDevice?.vendor === "tencent_iotvideo_industry"
        ? selectedDevice.device_code
        : null,
      vendor_channel_code: selectedDevice?.vendor === "tencent_iotvideo_industry"
        ? selectedDevice.channel_code
        : null,
      channel_no: 1,
    };
  }

  return {
    ...commonPayload,
    vendor: "ezviz",
    vendor_device_serial: device.deviceSerial,
    channel_no: device.channelNo,
  };
}

export async function saveCameraForm(input: {
  mode: CameraMode;
  projectId: string;
  activeProjectId: string;
  cameraId?: string;
  values: CameraFormValues;
  availableDevices: CameraDeviceChannel[];
}) {
  if (input.mode === "create") {
    await requestCamera({
      path: `/projects/${input.activeProjectId}/cameras`,
      method: "POST",
      payload: buildCreateCameraPayload(input.values, input.availableDevices),
    });
    return;
  }

  if (input.cameraId) {
    await requestCamera({
      path: `/projects/${input.projectId}/cameras/${input.cameraId}`,
      method: "PATCH",
      payload: buildCommonCameraPayload(input.values),
    });
  }
}

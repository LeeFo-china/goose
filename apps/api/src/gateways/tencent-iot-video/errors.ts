import {
  ErrorCodes,
  Errors,
  type TencentApiError,
  systemSettingsService,
} from "./shared";

export async function getRequiredSecretConfig(key: string) {
  const value = await systemSettingsService.getSecretString(key);
  if (!value) {
    throw Errors.business(
      503,
      "腾讯云监控服务暂未配置",
      ErrorCodes.TENCENT_IOT_VIDEO_CONFIG_ERROR,
      { key },
    );
  }

  return value;
}

function getTencentErrorMessage(error: TencentApiError | undefined) {
  if (!error) return "腾讯云监控接口调用失败";
  return `${error.Code || "Unknown"}: ${error.Message || "腾讯云监控接口调用失败"}`;
}

export function mapTencentApiError(error: TencentApiError | undefined, fallbackCode: string) {
  const code = error?.Code || fallbackCode;
  if (code === "InvalidParameterValue.DeviceOffline") {
    return Errors.business(409, "摄像头当前离线", ErrorCodes.CAMERA_OFFLINE, error);
  }

  if (code === "ResourceNotFound.DeviceNotExist") {
    return Errors.business(404, "摄像头不存在或已解绑", ErrorCodes.CAMERA_NOT_FOUND, error);
  }

  if (code === "ResourceUnavailable.StreamInfoException") {
    return Errors.business(
      503,
      "视频流信息异常，请稍后重试",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
      error,
    );
  }

  if (code === "UnsupportedOperation.DeviceSipCommandFail") {
    return Errors.business(
      503,
      "设备信令不通，请检查国标注册",
      ErrorCodes.TENCENT_IOT_VIDEO_PLAY_URL_ERROR,
      error,
    );
  }

  return Errors.business(
    503,
    getTencentErrorMessage(error),
    fallbackCode,
    error,
  );
}

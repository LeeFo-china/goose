import type { ServiceUnavailableCode } from "../models";
import { ApiRequestError } from "../api/request";

export function navigateToServiceUnavailable(code: ServiceUnavailableCode): Promise<void> {
  return new Promise((resolve, reject) => {
    tt.reLaunch({
      url: `/pages/service-unavailable/index?code=${encodeURIComponent(code)}`,
      success: () => resolve(),
      fail: () => reject(new ApiRequestError(
        0,
        "NETWORK_ERROR",
        "页面跳转失败",
      )),
    });
  });
}

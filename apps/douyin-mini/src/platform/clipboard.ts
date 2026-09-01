import { ApiRequestError } from "../api/request";

export type ClipboardSetter = typeof tt.setClipboardData;

const MAX_CLIPBOARD_TEXT_LENGTH = 512 * 1024;

export function copyTextToClipboard(
  text: string,
  setter: ClipboardSetter = tt.setClipboardData,
): Promise<void> {
  if (!text.trim() || text.length > MAX_CLIPBOARD_TEXT_LENGTH) {
    return Promise.reject(new ApiRequestError(
      0,
      "INVALID_CLIPBOARD_CONTENT",
      "没有可复制的正文",
    ));
  }
  return new Promise((resolve, reject) => {
    setter({
      data: text,
      success: () => resolve(),
      fail: () => reject(new ApiRequestError(
        0,
        "CLIPBOARD_WRITE_FAILED",
        "复制失败，请稍后重试",
      )),
    });
  });
}

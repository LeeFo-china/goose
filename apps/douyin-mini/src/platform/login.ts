import { ApiRequestError } from "../api/request";

export function loginOnce(): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    tt.login({
      force: false,
      success: ({ code }) => {
        if (!code) {
          reject(sessionExchangeFailed());
          return;
        }
        resolve({ code });
      },
      fail: () => reject(sessionExchangeFailed()),
    });
  });
}

function sessionExchangeFailed() {
  return new ApiRequestError(
    0,
    "DOUYIN_SESSION_EXCHANGE_FAILED",
    "抖音会话初始化失败",
  );
}

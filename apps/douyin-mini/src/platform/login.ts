import { ApiRequestError } from "../api/request";

export function loginOnce(): Promise<
  | { code: string; anonymousCode?: never }
  | { code?: never; anonymousCode: string }
> {
  return new Promise((resolve, reject) => {
    tt.login({
      force: false,
      success: ({ code, anonymousCode }) => {
        const normalizedCode = code?.trim() ?? "";
        if (normalizedCode) {
          resolve({ code: normalizedCode });
          return;
        }
        const normalizedAnonymousCode = anonymousCode?.trim() ?? "";
        if (normalizedAnonymousCode) {
          resolve({ anonymousCode: normalizedAnonymousCode });
          return;
        }
        reject(sessionExchangeFailed());
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

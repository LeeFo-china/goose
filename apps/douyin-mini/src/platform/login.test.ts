import { describe, expect, mock, test } from "bun:test";

import { loginOnce } from "./login";

describe("loginOnce", () => {
  test("requests a fresh login code", async () => {
    const login = mock((options: Parameters<typeof tt.login>[0]) => {
      expect(options.force).toBe(true);
      options.success?.({
        anonymousCode: "anonymous-login-code",
        code: "fresh-login-code",
        errMsg: "login:ok",
        isLogin: true,
      });
    });

    Object.defineProperty(globalThis, "tt", {
      configurable: true,
      value: { login },
    });

    try {
      await expect(loginOnce()).resolves.toEqual({
        code: "fresh-login-code",
      });
      expect(login).toHaveBeenCalledTimes(1);
    } finally {
      Reflect.deleteProperty(globalThis, "tt");
    }
  });
});

import { describe, expect, mock, test } from "bun:test";

import { loginOnce } from "./login";

describe("loginOnce", () => {
  test("requests a fresh login code", async () => {
    const login = mock((options: Parameters<typeof tt.login>[0]) => {
      expect(options.force).toBe(false);
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

  test("uses the anonymous credential when the host account is not logged in", async () => {
    const login = mock((options: Parameters<typeof tt.login>[0]) => {
      options.success?.({
        anonymousCode: "anonymous-login-code",
        code: "",
        errMsg: "login:ok",
        isLogin: false,
      });
    });

    Object.defineProperty(globalThis, "tt", {
      configurable: true,
      value: { login },
    });

    try {
      await expect(loginOnce()).resolves.toEqual({
        anonymousCode: "anonymous-login-code",
      });
    } finally {
      Reflect.deleteProperty(globalThis, "tt");
    }
  });
});

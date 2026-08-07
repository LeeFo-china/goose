import { describe, expect, mock, test } from "bun:test";
import {
  getAdminLoginNotice,
  navigateAfterAdminLogin,
} from "./login-form-navigation";

describe("admin login navigation", () => {
  test("navigates to dashboard without forcing a duplicate refresh", () => {
    const router = {
      replace: mock(() => undefined),
      refresh: mock(() => undefined),
    };

    navigateAfterAdminLogin(router);

    expect(router.replace).toHaveBeenCalledWith("/dashboard");
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  test("returns a fixed notice only for the supported session expiry reason", () => {
    expect(getAdminLoginNotice("session_expired")).toBe("登录已过期，请重新登录");
    expect(getAdminLoginNotice("arbitrary-message")).toBeNull();
    expect(getAdminLoginNotice(undefined)).toBeNull();
  });
});

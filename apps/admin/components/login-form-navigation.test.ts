import { describe, expect, mock, test } from "bun:test";
import { navigateAfterAdminLogin } from "./login-form-navigation";

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
});

import { describe, expect, test } from "bun:test";
import { isVisitorSessionRoute } from "./routes";

describe("isVisitorSessionRoute", () => {
  test("allows visitor sessions to submit wechat rebind requests only", () => {
    expect(isVisitorSessionRoute("POST", "/auth/wechat-rebind-requests")).toBe(true);

    expect(isVisitorSessionRoute("GET", "/employee/auth/wechat-rebind-requests")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/employee/auth/wechat-rebind-requests/request-id/approve")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/employee/auth/wechat-rebind-requests/request-id/reject")).toBe(false);
  });
});

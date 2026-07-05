import { describe, expect, test } from "bun:test";
import { isPublicRoute, isVisitorSessionRoute } from "./routes";

describe("isVisitorSessionRoute", () => {
  test("allows visitor sessions to submit wechat rebind requests only", () => {
    expect(isVisitorSessionRoute("POST", "/auth/wechat-rebind-requests")).toBe(true);

    expect(isVisitorSessionRoute("GET", "/employee/auth/wechat-rebind-requests")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/employee/auth/wechat-rebind-requests/request-id/approve")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/employee/auth/wechat-rebind-requests/request-id/reject")).toBe(false);
  });
});

describe("auth public route allowlist", () => {
  test("allows official partner application submissions without a token", () => {
    expect(isPublicRoute("POST", "/public/partner-applications")).toBe(true);
  });

  test("keeps platform partner application review routes protected", () => {
    expect(isPublicRoute("GET", "/platform/partner-applications")).toBe(false);
    expect(isPublicRoute(
      "POST",
      "/platform/partner-applications/00000000-0000-4000-8000-000000000001/approve",
    )).toBe(false);
  });
});

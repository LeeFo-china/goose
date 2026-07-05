import { describe, expect, test } from "bun:test";
import {
  isPartnerAuthRoute,
  isPartnerPortalRoute,
  isPublicRoute,
  isVisitorSessionRoute,
  shouldBypassAuth,
} from "./routes";

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

  test("allows mini-program partner invite code lookup without a token", () => {
    expect(isPublicRoute("GET", "/partner-onboarding/invite-codes/CP-411500-ABC")).toBe(true);
    expect(isPublicRoute("POST", "/partner-onboarding/tenant-binding")).toBe(false);
  });

  test("keeps platform partner application review routes protected", () => {
    expect(isPublicRoute("GET", "/platform/partner-applications")).toBe(false);
    expect(isPublicRoute(
      "POST",
      "/platform/partner-applications/00000000-0000-4000-8000-000000000001/approve",
    )).toBe(false);
  });

  test("bypasses partner auth public routes even when a token is present", () => {
    expect(isPartnerAuthRoute("POST", "/partner/auth/login")).toBe(true);
    expect(isPartnerAuthRoute("POST", "/partner/auth/send-code")).toBe(true);
    expect(isPartnerAuthRoute("POST", "/partner/auth/bind-phone")).toBe(true);
    expect(isPartnerAuthRoute("GET", "/partner/auth/me")).toBe(false);

    expect(shouldBypassAuth("POST", "/partner/auth/login")).toBe(true);
    expect(shouldBypassAuth("GET", "/partner/auth/me")).toBe(false);
  });

  test("scopes platform partner tokens to partner portal routes", () => {
    expect(isPartnerPortalRoute("GET", "/partner/auth/me")).toBe(true);
    expect(isPartnerPortalRoute("HEAD", "/partner/auth/me")).toBe(true);

    expect(isPartnerPortalRoute("POST", "/partner/auth/me")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/partner/dashboard/summary")).toBe(false);
    expect(isPartnerPortalRoute("POST", "/partner/dashboard/summary")).toBe(false);
    expect(isPartnerPortalRoute("DELETE", "/partner/dashboard/summary")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/partner/invite-codes")).toBe(false);
    expect(isPartnerPortalRoute("POST", "/partner/invite-codes")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/ai/decoration-qa/suggestions")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/platform/partners")).toBe(false);
  });
});

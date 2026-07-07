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

  test("allows visitor sessions to list and switch auth identities", () => {
    expect(isVisitorSessionRoute("GET", "/auth/identities")).toBe(true);
    expect(isVisitorSessionRoute("HEAD", "/auth/identities")).toBe(true);
    expect(isVisitorSessionRoute("POST", "/auth/switch")).toBe(true);
    expect(isVisitorSessionRoute("POST", "/auth/switch/visitor")).toBe(true);

    expect(isVisitorSessionRoute("DELETE", "/auth/identities")).toBe(false);
    expect(isVisitorSessionRoute("GET", "/auth/switch")).toBe(false);
    expect(isVisitorSessionRoute("GET", "/auth/switch/visitor")).toBe(false);
  });
});

describe("auth public route allowlist", () => {
  test("allows official partner application submissions without a token", () => {
    expect(isPublicRoute("POST", "/public/partner-applications")).toBe(true);
    expect(isPublicRoute("POST", "/public/partner-applications/send-code")).toBe(true);
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
    expect(isPartnerAuthRoute("POST", "/partner/auth/unbind-code")).toBe(false);
    expect(isPartnerAuthRoute("POST", "/partner/auth/unbind-wechat")).toBe(false);
    expect(isPartnerAuthRoute("GET", "/partner/auth/me")).toBe(false);

    expect(shouldBypassAuth("POST", "/partner/auth/login")).toBe(true);
    expect(shouldBypassAuth("POST", "/partner/auth/unbind-code")).toBe(false);
    expect(shouldBypassAuth("POST", "/partner/auth/unbind-wechat")).toBe(false);
    expect(shouldBypassAuth("GET", "/partner/auth/me")).toBe(false);
  });

  test("keeps partner unbind routes protected from public access", () => {
    expect(isPublicRoute("POST", "/partner/auth/unbind-code")).toBe(false);
    expect(isPublicRoute("POST", "/partner/auth/unbind-wechat")).toBe(false);
  });

  test("scopes platform partner tokens to partner portal routes", () => {
    const partnerPortalRoutes = [
      "/partner/auth/me",
      "/partner/dashboard/summary",
      "/partner/invite-codes",
      "/partner/dashboard/tenants",
      "/partner/dashboard/revenue-events",
      "/partner/dashboard/commission-ledger",
      "/partner/dashboard/settlements",
    ];

    for (const route of partnerPortalRoutes) {
      expect(isPartnerPortalRoute("GET", route)).toBe(true);
      expect(isPartnerPortalRoute("HEAD", route)).toBe(true);
      expect(isPartnerPortalRoute("POST", route)).toBe(false);
      expect(isPartnerPortalRoute("DELETE", route)).toBe(false);
    }

    expect(isPartnerPortalRoute("POST", "/partner/auth/me")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/partner/dashboard")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/partner/dashboard/unknown")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/partner/invite-codes/extra")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/ai/decoration-qa/suggestions")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/platform/partners")).toBe(false);
  });

  test("allows platform partner tokens to access partner unbind routes", () => {
    expect(isPartnerPortalRoute("POST", "/partner/auth/unbind-code")).toBe(true);
    expect(isPartnerPortalRoute("POST", "/partner/auth/unbind-wechat")).toBe(true);
    expect(isPartnerPortalRoute("GET", "/partner/auth/unbind-code")).toBe(false);
    expect(isPartnerPortalRoute("HEAD", "/partner/auth/unbind-wechat")).toBe(false);
  });

  test("allows platform partner tokens to list and switch auth identities", () => {
    expect(isPartnerPortalRoute("GET", "/auth/identities")).toBe(true);
    expect(isPartnerPortalRoute("HEAD", "/auth/identities")).toBe(true);
    expect(isPartnerPortalRoute("POST", "/auth/switch")).toBe(true);
    expect(isPartnerPortalRoute("POST", "/auth/switch/visitor")).toBe(true);

    expect(isPartnerPortalRoute("DELETE", "/auth/identities")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/auth/switch")).toBe(false);
    expect(isPartnerPortalRoute("GET", "/auth/switch/visitor")).toBe(false);
  });
});

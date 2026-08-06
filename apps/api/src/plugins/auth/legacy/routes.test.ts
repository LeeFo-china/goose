import { describe, expect, test } from "bun:test";
import {
  isDouyinMiniappRoute,
  isPartnerAuthRoute,
  isPartnerPortalRoute,
  isPublicRoute,
  isVisitorSessionRoute,
  shouldBypassAuth,
} from "./routes";

describe("Douyin miniapp route isolation", () => {
  test("bypasses only session exchange and classifies the protected namespace", () => {
    expect(shouldBypassAuth("POST", "/douyin-mini/auth/session")).toBe(true);
    expect(shouldBypassAuth("GET", "/douyin-mini/auth/session")).toBe(false);
    expect(shouldBypassAuth("POST", "/douyin-mini/auth/session/extra")).toBe(false);
    expect(isDouyinMiniappRoute("/douyin-mini/bootstrap")).toBe(true);
    expect(isDouyinMiniappRoute("/douyin-mini/cases?page=1")).toBe(true);
    expect(isDouyinMiniappRoute("/douyin-miniature/bootstrap")).toBe(false);
  });
});

describe("isVisitorSessionRoute", () => {
  test("allows applicant routes only with visitor sessions", () => {
    const routes = [
      ["POST", "/tenant-onboarding/applications/send-code"],
      ["POST", "/tenant-onboarding/applications"],
      ["GET", "/tenant-onboarding/applications/mine"],
      ["GET", "/tenant-onboarding/applications/application-id"],
      ["PATCH", "/tenant-onboarding/applications/application-id/supplement"],
      ["POST", "/tenant-onboarding/applications/application-id/withdraw"],
      ["GET", "/tenant-onboarding/ocr/capabilities"],
      ["HEAD", "/tenant-onboarding/ocr/capabilities"],
      ["POST", "/tenant-onboarding/ocr/recognitions"],
      ["GET", "/tenant-onboarding/ocr/recognitions/recognition-id"],
      ["HEAD", "/tenant-onboarding/ocr/recognitions/recognition-id"],
      ["GET", "/visitor/local-service-providers"],
    ] as const;

    for (const [method, route] of routes) {
      expect(isVisitorSessionRoute(method, route)).toBe(true);
      expect(isPublicRoute(method, route)).toBe(false);
    }

    expect(isVisitorSessionRoute("DELETE", "/tenant-onboarding/applications/application-id"))
      .toBe(false);
    expect(isVisitorSessionRoute("GET", "/tenant-onboarding/applications"))
      .toBe(false);
    expect(isVisitorSessionRoute("GET", "/tenant-onboarding/ocr/recognitions"))
      .toBe(false);
    expect(isVisitorSessionRoute("POST", "/tenant-onboarding/ocr/capabilities"))
      .toBe(false);
    expect(isVisitorSessionRoute(
      "GET",
      "/tenant-onboarding/ocr/recognitions/recognition-id/extra",
    )).toBe(false);
  });

  test("allows visitor sessions to submit wechat rebind requests only", () => {
    expect(isVisitorSessionRoute("POST", "/auth/wechat-rebind-requests")).toBe(true);
    expect(isVisitorSessionRoute("POST", "/partner/auth/rebind-code")).toBe(true);
    expect(isVisitorSessionRoute("POST", "/partner/auth/rebind-requests")).toBe(true);

    expect(isVisitorSessionRoute("GET", "/employee/auth/wechat-rebind-requests")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/employee/auth/wechat-rebind-requests/request-id/approve")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/employee/auth/wechat-rebind-requests/request-id/reject")).toBe(false);
    expect(isVisitorSessionRoute("GET", "/platform/partner-member-rebind-requests")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/platform/partner-member-rebind-requests/request-id/approve")).toBe(false);
    expect(isVisitorSessionRoute("POST", "/platform/partner-member-rebind-requests/request-id/reject")).toBe(false);
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

  test("allows visitor sessions to use unified phone login and submit platform leads", () => {
    const phoneLoginRoutes = [
      "/auth/phone-login/send-code",
      "/auth/phone-login/verify",
      "/auth/phone-login/select",
    ];

    for (const route of phoneLoginRoutes) {
      expect(isVisitorSessionRoute("POST", route)).toBe(true);
      expect(isPublicRoute("POST", route)).toBe(false);
      expect(shouldBypassAuth("POST", route)).toBe(false);
    }

    expect(isVisitorSessionRoute("POST", "/platform/leads")).toBe(true);
    expect(isPublicRoute("POST", "/platform/leads")).toBe(false);
    expect(shouldBypassAuth("POST", "/platform/leads")).toBe(false);

    expect(isVisitorSessionRoute("GET", "/platform/leads")).toBe(false);
    expect(isVisitorSessionRoute("GET", "/platform/leads/00000000-0000-4000-8000-000000000001"))
      .toBe(false);
    expect(isVisitorSessionRoute("POST", "/platform/leads/00000000-0000-4000-8000-000000000001/assign"))
      .toBe(false);
  });

  test("allows visitor sessions to open, view, and assist share campaigns", () => {
    expect(isVisitorSessionRoute("POST", "/share-campaigns/open")).toBe(true);
    expect(isVisitorSessionRoute("GET", "/share-campaigns/share-token")).toBe(true);
    expect(isVisitorSessionRoute("HEAD", "/share-campaigns/share-token")).toBe(true);
    expect(isVisitorSessionRoute("POST", "/share-campaigns/assist")).toBe(true);

    expect(isPublicRoute("POST", "/share-campaigns/open")).toBe(true);
    expect(isPublicRoute("GET", "/share-campaigns/share-token")).toBe(true);
    expect(isPublicRoute("POST", "/share-campaigns/assist")).toBe(false);
    expect(shouldBypassAuth("POST", "/share-campaigns/assist")).toBe(false);
  });
});

describe("auth public route allowlist", () => {
  test("allows only exact WeChat virtual-payment GET and POST event routes", () => {
    const route = "/wechat/virtual-payment/events";
    expect(isPublicRoute("GET", route)).toBe(true);
    expect(isPublicRoute("POST", route)).toBe(true);

    for (const method of ["HEAD", "PUT", "PATCH", "DELETE"]) {
      expect(isPublicRoute(method, route)).toBe(false);
    }
    for (const path of [
      "/wechat/virtual-payment/events/",
      "/wechat/virtual-payment/events/extra",
      "/wechat/virtual-payment",
      "/wechat/virtual-payment/events-other",
    ]) {
      expect(isPublicRoute("GET", path)).toBe(false);
      expect(isPublicRoute("POST", path)).toBe(false);
    }
  });

  test("allows only effective branding reads without a token or with a visitor session", () => {
    for (const method of ["GET", "HEAD"]) {
      expect(isPublicRoute(method, "/branding/effective")).toBe(true);
      expect(isVisitorSessionRoute(method, "/branding/effective")).toBe(true);
      expect(shouldBypassAuth(method, "/branding/effective")).toBe(false);
    }

    const protectedRoutes = [
      ["POST", "/branding/effective"],
      ["GET", "/platform/branding"],
      ["PATCH", "/platform/branding"],
      ["POST", "/platform/branding/publish"],
      ["GET", "/platform/tenants/tenant-id/entitlements"],
      [
        "POST",
        "/platform/tenants/tenant-id/entitlements/custom_support_branding/grant",
      ],
      [
        "POST",
        "/platform/tenants/tenant-id/entitlements/custom_support_branding/suspend",
      ],
      [
        "POST",
        "/platform/tenants/tenant-id/entitlements/custom_support_branding/resume",
      ],
      [
        "POST",
        "/platform/tenants/tenant-id/entitlements/custom_support_branding/revoke",
      ],
      ["GET", "/tenant/branding"],
      ["PATCH", "/tenant/branding"],
      ["POST", "/tenant/branding/publish"],
    ] as const;

    for (const [method, route] of protectedRoutes) {
      expect(isPublicRoute(method, route)).toBe(false);
      expect(isVisitorSessionRoute(method, route)).toBe(false);
    }

    expect(isPartnerPortalRoute("GET", "/branding/effective")).toBe(false);
    expect(isPartnerPortalRoute("HEAD", "/branding/effective")).toBe(false);
    expect(isPublicRoute("GET", "/branding/effective/extra")).toBe(false);
    expect(isVisitorSessionRoute("GET", "/branding/effective/extra")).toBe(
      false,
    );
  });

  test("allows official partner application submissions without a token", () => {
    expect(isPublicRoute("POST", "/public/partner-applications")).toBe(true);
    expect(isPublicRoute("POST", "/public/partner-applications/proxy-ip-check")).toBe(true);
    expect(isPublicRoute("POST", "/public/partner-applications/send-code")).toBe(true);
  });

  test("allows mini-program partner invite code lookup without a token", () => {
    expect(isPublicRoute("GET", "/partner-onboarding/invite-codes/CP-411500-ABC")).toBe(true);
    expect(isPublicRoute("POST", "/partner-onboarding/tenant-binding")).toBe(false);
  });

  test("allows partner tenant onboarding submissions without a token", () => {
    expect(isPublicRoute("POST", "/partner-onboarding/tenant-applications/send-code")).toBe(true);
    expect(isPublicRoute("POST", "/partner-onboarding/tenant-applications")).toBe(true);
    expect(isPublicRoute("GET", "/partner-onboarding/tenant-applications")).toBe(false);
  });

  test("keeps platform partner application review routes protected", () => {
    expect(isPublicRoute("GET", "/platform/partner-applications")).toBe(false);
    expect(isPublicRoute(
      "POST",
      "/platform/partner-applications/00000000-0000-4000-8000-000000000001/approve",
    )).toBe(false);
  });

  test("allows only official website content reads without a token", () => {
    const routes = [
      "/public/site/articles",
      "/public/site/articles/first-article",
      "/public/site/cases",
      "/public/site/cases/hangzhou-home",
      "/public/site/cities",
      "/public/site/cities/hangzhou",
    ];

    for (const route of routes) {
      expect(isPublicRoute("GET", route)).toBe(true);
      expect(isPublicRoute("HEAD", route)).toBe(true);
      expect(isPublicRoute("POST", route)).toBe(false);
      expect(isPublicRoute("PATCH", route)).toBe(false);
      expect(shouldBypassAuth("GET", route)).toBe(false);
    }

    for (const route of [
      "/public/site/articles/first-article/extra",
      "/public/site/articles-extra",
      "/public/site/article/first-article",
      "/public/site/cities/hangzhou/extra",
      "/public/site-content/articles",
    ]) {
      expect(isPublicRoute("GET", route)).toBe(false);
    }
  });

  test("bypasses bearer auth only for HMAC-protected preview routes", () => {
    expect(shouldBypassAuth("POST", "/internal/site-content/preview/consume")).toBe(true);
    expect(shouldBypassAuth("GET", "/internal/site-content/versions/version-id/preview")).toBe(true);
    expect(shouldBypassAuth("HEAD", "/internal/site-content/versions/version-id/preview")).toBe(true);

    expect(isPublicRoute("POST", "/internal/site-content/preview/consume")).toBe(false);
    expect(isPublicRoute("GET", "/internal/site-content/versions/version-id/preview")).toBe(false);
    expect(isPublicRoute("HEAD", "/internal/site-content/versions/version-id/preview")).toBe(false);

    for (const [method, route] of [
      ["GET", "/internal/site-content/preview/consume"],
      ["POST", "/internal/site-content/versions/version-id/preview"],
      ["GET", "/internal/site-content/versions/version-id/preview/extra"],
      ["GET", "/internal/site-content/versions//preview"],
      ["GET", "/internal/site-content-extra/versions/version-id/preview"],
    ] as const) {
      expect(shouldBypassAuth(method, route)).toBe(false);
    }
  });

  test("bypasses bearer auth only for exact Douyin callback POST routes", () => {
    const callbackRoutes = [
      "/douyin-thirdparty/events/authorization",
      "/douyin-thirdparty/events/message",
    ];

    for (const route of callbackRoutes) {
      expect(shouldBypassAuth("POST", route)).toBe(true);
      expect(isPublicRoute("POST", route)).toBe(false);
      expect(shouldBypassAuth("GET", route)).toBe(false);
      expect(shouldBypassAuth("HEAD", route)).toBe(false);
    }

    expect(shouldBypassAuth("POST", "/douyin-thirdparty/events")).toBe(false);
    expect(shouldBypassAuth(
      "POST",
      "/douyin-thirdparty/events/authorization/extra",
    )).toBe(false);
    expect(shouldBypassAuth("POST", "/douyin-thirdparty/events/unknown")).toBe(false);
  });

  test("bypasses bearer auth only for one app-scoped Douyin message callback segment", () => {
    const route = "/douyin-thirdparty/events/message/tt-authorizer-1/callback";

    expect(shouldBypassAuth("POST", route)).toBe(true);
    expect(isPublicRoute("POST", route)).toBe(false);
    expect(shouldBypassAuth("GET", route)).toBe(false);
    expect(shouldBypassAuth("HEAD", route)).toBe(false);

    for (const invalidRoute of [
      "/douyin-thirdparty/events/message//callback",
      "/douyin-thirdparty/events/message/tt-authorizer-1",
      "/douyin-thirdparty/events/message/tt-authorizer-1/callback/extra",
      "/douyin-thirdparty/events/message/one/two/callback",
      `/douyin-thirdparty/events/message/${"a".repeat(129)}/callback`,
    ]) {
      expect(shouldBypassAuth("POST", invalidRoute)).toBe(false);
    }
  });

  test("bypasses partner auth public routes even when a token is present", () => {
    expect(isPartnerAuthRoute("POST", "/partner/auth/login")).toBe(true);
    expect(isPartnerAuthRoute("POST", "/partner/auth/send-code")).toBe(true);
    expect(isPartnerAuthRoute("POST", "/partner/auth/bind-phone")).toBe(true);
    expect(isPartnerAuthRoute("POST", "/partner/auth/rebind-code")).toBe(false);
    expect(isPartnerAuthRoute("POST", "/partner/auth/rebind-requests")).toBe(false);
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
      "/partner/invite-code/default",
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

  test("scopes partner onboarding assist routes to platform partner tokens", () => {
    const applicationId = "00000000-0000-4000-8000-000000000501";
    const routes = [
      ["GET", "/partner/onboarding-applications"],
      ["HEAD", "/partner/onboarding-applications"],
      ["GET", `/partner/onboarding-applications/${applicationId}`],
      ["HEAD", `/partner/onboarding-applications/${applicationId}`],
      ["POST", `/partner/onboarding-applications/${applicationId}/assist-review`],
    ] as const;

    for (const [method, route] of routes) {
      expect(isPartnerPortalRoute(method, route)).toBe(true);
      expect(isPublicRoute(method, route)).toBe(false);
      expect(isVisitorSessionRoute(method, route)).toBe(false);
    }
    expect(isPartnerPortalRoute("POST", "/partner/onboarding-applications"))
      .toBe(false);
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

  test("allows platform partner tokens to use unified phone login", () => {
    const phoneLoginRoutes = [
      "/auth/phone-login/send-code",
      "/auth/phone-login/verify",
      "/auth/phone-login/select",
    ];

    for (const route of phoneLoginRoutes) {
      expect(isPartnerPortalRoute("POST", route)).toBe(true);
      expect(isPublicRoute("POST", route)).toBe(false);
      expect(shouldBypassAuth("POST", route)).toBe(false);
    }
  });
});

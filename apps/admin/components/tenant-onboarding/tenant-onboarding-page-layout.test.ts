import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("platform tenant onboarding page", () => {
  test("uses the measured platform list shell and peer workflow tabs", () => {
    const pageSource = readSource(
      "../../app/(console)/platform/tenant-onboarding/page.tsx",
    );

    expect(pageSource).toContain("PlatformListPageShell");
    expect(pageSource).toContain("normalizePlatformListPageSize");
    expect(pageSource).toContain('value="applications"');
    expect(pageSource).toContain('value="publications"');
    expect(pageSource).toContain("h-[calc(100vh-6.5625rem)]");
    expect(pageSource).toContain("min-h-0 flex-col gap-5 overflow-hidden");
  });

  test("keeps review mutations authenticated, idempotent, and refreshable", () => {
    const actionsSource = readSource("./tenant-onboarding-actions.tsx");
    const proxySource = readSource("../../app/api/backend/[...path]/route.ts");

    expect(actionsSource).toContain("requestBackendJson");
    expect(actionsSource).toContain("Idempotency-Key");
    expect(actionsSource).toContain("router.refresh()");
    expect(actionsSource).toContain("刷新后重试");
    expect(actionsSource).toContain("/start-review");
    expect(actionsSource).toContain("/request-partner-assist");
    expect(actionsSource).toContain("/request-supplement");
    expect(actionsSource).toContain("/approve");
    expect(actionsSource).toContain("/reject");
    expect(actionsSource).toContain("/publish");
    expect(actionsSource).toContain("/return-draft");
    expect(actionsSource).toContain("/suspend");
    expect(proxySource).toContain('request.headers.get("idempotency-key")');
    expect(proxySource).toContain('headers.set("idempotency-key"');
  });

  test("loads private detail timelines and publication areas only on demand", () => {
    const applicationDetailSource = readSource("./tenant-onboarding-detail-dialog.tsx");
    const publicationDetailSource = readSource("./service-provider-publication-dialog.tsx");

    expect(applicationDetailSource).toContain("/license-access");
    expect(applicationDetailSource).toContain("/reviews?");
    expect(applicationDetailSource).toContain("/notifications?");
    expect(applicationDetailSource).toContain("pageSize=10");
    expect(applicationDetailSource).toContain("加载更多");
    expect(applicationDetailSource).toContain("refreshApplicationAfterConflict");
    expect(applicationDetailSource).toContain("retryError.code");
    expect(publicationDetailSource).toContain("/areas?");
    expect(publicationDetailSource).toContain("pageSize=10");
    expect(publicationDetailSource).toContain("加载更多");
    expect(publicationDetailSource).toContain("refreshProfileAfterConflict");
  });

  test("keeps UI workflow states aligned with the backend contract", () => {
    const typeSource = readSource("./tenant-onboarding-types.ts");
    const filtersSource = readSource("./tenant-onboarding-filters.tsx");

    expect(typeSource).toContain('"supplement_required"');
    expect(typeSource).toContain('"supplement_suggested"');
    expect(typeSource).toContain('"pending_review"');
    expect(typeSource).not.toContain("frontend_status");
    expect(filtersSource).toContain('htmlFor="tenant-onboarding-status-filter"');
    expect(filtersSource).toContain('htmlFor="tenant-onboarding-assist-filter"');
    expect(filtersSource).toContain('aria-label={props.tab');
  });

  test("exposes the workflow through the dedicated platform permission", () => {
    const menuSource = readSource("../layout/menu-config.ts");

    expect(menuSource).toContain('href: "/platform/tenant-onboarding"');
    expect(menuSource).toContain('permission: "platform.tenant_onboarding.review"');
  });
});

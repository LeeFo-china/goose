import { describe, expect, test } from "bun:test";

import type { AdminTenantServiceAccess } from "@gooes/domain";

import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";

import {
  decideServiceAccessView,
  isServiceRecoveryRoute,
} from "./service-access-routes";

function ready(
  accessStatus: AdminTenantServiceAccess["accessStatus"],
): TenantServiceAccessLoadResult {
  const isWorkspace = accessStatus === "workspace_available";
  const isReadonly = accessStatus === "grace_period";

  return {
    kind: "ready",
    summary: {
      accessStatus,
      accessMode: isWorkspace ? "paid" : isReadonly ? "grace" : "service_blocked",
      accessLevel: isWorkspace ? "read_write" : isReadonly ? "read_only" : "none",
      canEnterWorkspace: isWorkspace || isReadonly,
      readonly: isReadonly,
      trialId: null,
      trialStatus: null,
      startsAt: null,
      endsAt: null,
      evaluatedAt: "2026-08-19T00:00:00.000Z",
      title: "服务状态",
      message: "服务状态说明",
      primaryAction: null,
      secondaryAction: null,
    },
  };
}

describe("isServiceRecoveryRoute", () => {
  test("allows only service access and billing route scopes", () => {
    expect(isServiceRecoveryRoute("/service-access")).toBe(true);
    expect(isServiceRecoveryRoute("/service-access/history")).toBe(true);
    expect(isServiceRecoveryRoute("/billing")).toBe(true);
    expect(isServiceRecoveryRoute("/billing/history")).toBe(true);
    expect(isServiceRecoveryRoute("/projects")).toBe(false);
  });

  test("does not match similarly prefixed business routes", () => {
    expect(isServiceRecoveryRoute("/billing-other")).toBe(false);
    expect(isServiceRecoveryRoute("/service-access-old")).toBe(false);
  });
});

describe("decideServiceAccessView", () => {
  test("shows the workspace for bypass and available sessions", () => {
    expect(decideServiceAccessView({ kind: "bypass" }, "/projects"))
      .toBe("workspace");
    expect(decideServiceAccessView(ready("workspace_available"), "/projects"))
      .toBe("workspace");
  });

  test("shows readonly workspace during the grace period", () => {
    expect(decideServiceAccessView(ready("grace_period"), "/projects"))
      .toBe("readonly");
  });

  test("keeps every blocked state on recovery routes", () => {
    const blockedStatuses = [
      "pending_review",
      "scheduled",
      "expired",
      "service_blocked",
      "hard_blocked",
    ] as const;

    for (const status of blockedStatuses) {
      expect(decideServiceAccessView(ready(status), "/service-access"))
        .toBe("recovery");
      expect(decideServiceAccessView(ready(status), "/billing/orders"))
        .toBe("recovery");
    }
  });

  test("replaces ordinary routes for every blocked state", () => {
    const blockedStatuses = [
      "pending_review",
      "scheduled",
      "expired",
      "service_blocked",
      "hard_blocked",
    ] as const;

    for (const status of blockedStatuses) {
      expect(decideServiceAccessView(ready(status), "/projects"))
        .toBe("replace");
    }
  });

  test("shows the unavailable system state without inferring access", () => {
    expect(decideServiceAccessView({
      kind: "unavailable",
      message: "服务状态暂时无法加载，请稍后重试",
    }, "/projects")).toBe("unavailable");
  });
});

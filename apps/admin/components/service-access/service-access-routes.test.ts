import { describe, expect, test } from "bun:test";

import type { AdminTenantServiceAccess } from "@gooes/domain";

import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";

import { getServiceAccessProviderKey } from "./service-access-context";
import {
  decideServiceAccessView,
  isServiceRecoveryRoute,
} from "./service-access-routes";

function ready(
  accessStatus: AdminTenantServiceAccess["accessStatus"],
  evaluatedAt = "2026-08-19T00:00:00.000Z",
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
      evaluatedAt,
      title: "服务状态",
      message: "服务状态说明",
      primaryAction: null,
      secondaryAction: null,
    },
  };
}

describe("getServiceAccessProviderKey", () => {
  test("changes provider identity from workspace to blocked", () => {
    const workspaceKey = getServiceAccessProviderKey(
      ready("workspace_available"),
    );

    expect(getServiceAccessProviderKey(ready("service_blocked")))
      .not.toBe(workspaceKey);
  });

  test("changes provider identity from workspace to bypass", () => {
    const workspaceKey = getServiceAccessProviderKey(
      ready("workspace_available"),
    );

    expect(getServiceAccessProviderKey({ kind: "bypass" }))
      .not.toBe(workspaceKey);
  });

  test("keeps provider identity when the same access status is reevaluated", () => {
    const initial = ready(
      "workspace_available",
      "2026-08-19T00:00:00.000Z",
    );
    const reevaluated = ready(
      "workspace_available",
      "2026-08-19T00:01:00.000Z",
    );

    expect(getServiceAccessProviderKey(reevaluated))
      .toBe(getServiceAccessProviderKey(initial));
  });

  test("keeps provider identity stable for the same authority result", () => {
    expect(getServiceAccessProviderKey(ready(
      "workspace_available",
      "2026-08-19T00:00:00.000Z",
    )))
      .toBe(getServiceAccessProviderKey(ready(
        "workspace_available",
        "2026-08-19T00:00:00.000Z",
      )));
  });
});

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

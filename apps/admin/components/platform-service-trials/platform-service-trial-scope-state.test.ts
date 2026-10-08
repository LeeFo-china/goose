import { expect, test } from "bun:test";
import { PLATFORM_SERVICE_TRIAL_FULL_SCOPE } from "@gooes/domain";
import { buildTrialScopeCommand, getTrialScopeAction, isTrialScopeConflict } from "./platform-service-trial-scope-state";

test("scope command never sends deadlines or extension fields", () => {
  const body = buildTrialScopeCommand({ scope: PLATFORM_SERVICE_TRIAL_FULL_SCOPE.capabilities,
    version: 8, reason: "  补齐业务  ", idempotencyKey: "intent" });
  expect(body).toEqual({ scope: PLATFORM_SERVICE_TRIAL_FULL_SCOPE, expected_version: 8,
    idempotency_key: "intent", reason: "补齐业务" });
  expect(body.scope.capabilities).toHaveLength(13);
});

test("only explicit scope action permits scheduled, active and grace edits", () => {
  const enabled = { enabled: true, disabled_reason: null };
  for (const status of ["scheduled", "active", "grace_period"] as const) {
    expect(getTrialScopeAction({ trial: { status }, available_actions: { update_scope: enabled } }).enabled).toBe(true);
    expect(getTrialScopeAction({ trial: { status }, available_actions: { extend: enabled } }).enabled).toBe(false);
  }
  for (const status of ["expired", "revoked", "converted", "pending_review"] as const) {
    expect(getTrialScopeAction({ trial: { status }, available_actions: { update_scope: enabled } }).enabled).toBe(false);
  }
  expect(getTrialScopeAction(null).enabled).toBe(false);
  expect(getTrialScopeAction({ trial: { status: "active" }, available_actions: {
    update_scope: { enabled: false, disabled_reason: "无管理权限" },
  } }).disabled_reason).toBe("无管理权限");
});

test("409 requires review after reload", () => {
  expect(isTrialScopeConflict({ status: 409 })).toBe(true);
  expect(isTrialScopeConflict({ status: 500 })).toBe(false);
  expect(isTrialScopeConflict(null)).toBe(false);
});

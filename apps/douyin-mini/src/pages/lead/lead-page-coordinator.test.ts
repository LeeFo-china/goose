import { describe, expect, test } from "bun:test";

import {
  LeadPageCoordinator,
  getCooldownRemainingSeconds,
} from "./lead-page-coordinator";

describe("lead page async authority", () => {
  test("is active during initial load and rejects every operation after unload", () => {
    const lifecycle = new LeadPageCoordinator();
    expect(lifecycle.onLoad()).toBe(true);
    expect(lifecycle.isVisible()).toBe(true);
    lifecycle.onUnload();
    expect(lifecycle.onLoad()).toBe(false);
    expect(lifecycle.onShow()).toBe(false);
    expect(lifecycle.isVisible()).toBe(false);
  });

  test("invalidates hidden SMS responses without unlocking a newer request", () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const hiddenSms = lifecycle.beginSms();
    expect(hiddenSms).not.toBeNull();
    expect(lifecycle.beginSms()).toBeNull();

    lifecycle.onHide();
    lifecycle.onShow();
    const currentSms = lifecycle.beginSms();
    expect(currentSms).not.toBeNull();
    expect(lifecycle.finishSms(hiddenSms!)).toBe(false);
    expect(lifecycle.beginSms()).toBeNull();
    expect(lifecycle.finishSms(currentSms!)).toBe(true);
  });

  test("invalidates hidden submit presentation but allows a deliberate retry", () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const hiddenSubmit = lifecycle.beginSubmit();
    expect(hiddenSubmit).not.toBeNull();
    expect(lifecycle.beginSubmit()).toBeNull();

    lifecycle.onHide();
    expect(lifecycle.finishSubmit(hiddenSubmit!)).toBe(false);
    lifecycle.onShow();
    const retry = lifecycle.beginSubmit();
    expect(retry).not.toBeNull();
    expect(lifecycle.finishSubmit(retry!)).toBe(true);
  });

  test("never reactivates after unload", () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const submit = lifecycle.beginSubmit();
    lifecycle.onUnload();
    lifecycle.onShow();

    expect(lifecycle.finishSubmit(submit!)).toBe(false);
    expect(lifecycle.beginSubmit()).toBeNull();
    expect(lifecycle.isVisible()).toBe(false);
  });

  test("derives cooldown from an absolute deadline across a hidden interval", () => {
    const now = 1_775_000_000_000;
    const cooldownUntil = now + 60_000;

    expect(getCooldownRemainingSeconds(cooldownUntil, now)).toBe(60);
    expect(getCooldownRemainingSeconds(cooldownUntil, now + 30_001)).toBe(30);
    expect(getCooldownRemainingSeconds(cooldownUntil, now + 60_000)).toBe(0);
  });
});

import { describe, expect, test } from "bun:test";

import {
  LeadPageCoordinator,
  getCooldownRemainingSeconds,
  recordSmsCooldownUntil,
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

  test("records a hidden SMS success as a deadline without presentation authority", () => {
    const now = 1_775_000_000_000;
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const hiddenSms = lifecycle.beginSms();
    lifecycle.onHide();

    const cooldownUntil = recordSmsCooldownUntil(0, 60, now);
    expect(lifecycle.finishSms(hiddenSms!)).toBe(false);
    expect(cooldownUntil).toBe(now + 60_000);

    lifecycle.onShow();
    expect(getCooldownRemainingSeconds(cooldownUntil, now + 15_001)).toBe(45);
  });

  test("shares one bootstrap flight across hide and show", () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onLoad();
    expect(lifecycle.beginBootstrapLoad()).toBe(true);
    lifecycle.onHide();
    lifecycle.onShow();

    expect(lifecycle.beginBootstrapLoad()).toBe(false);
    expect(lifecycle.finishBootstrapLoad()).toBe(true);
  });

  test("allows reload when a hidden bootstrap flight settled without presentation", () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onLoad();
    expect(lifecycle.beginBootstrapLoad()).toBe(true);
    lifecycle.onHide();
    expect(lifecycle.finishBootstrapLoad()).toBe(false);
    lifecycle.onShow();
    expect(lifecycle.beginBootstrapLoad()).toBe(true);
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

  test("rejects a privacy refresh continuation after hide, show and a newer submit", async () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const stale = lifecycle.beginSubmit()!;
    expect(lifecycle.finishSubmit(stale)).toBe(true);
    let resolveRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => { resolveRefresh = resolve; });
    const presentations: string[] = [];
    const continuation = refresh.then(() => {
      if (lifecycle.canPresentSubmitContinuation(stale)) presentations.push("stale");
    });

    lifecycle.onHide();
    lifecycle.onShow();
    const current = lifecycle.beginSubmit()!;
    resolveRefresh();
    await continuation;

    expect(presentations).toEqual([]);
    expect(lifecycle.beginSubmit()).toBeNull();
    expect(lifecycle.finishSubmit(current)).toBe(true);
  });

  test("rejects a privacy refresh rejection after unload", async () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const stale = lifecycle.beginSubmit()!;
    expect(lifecycle.finishSubmit(stale)).toBe(true);
    let rejectRefresh!: (error: Error) => void;
    const refresh = new Promise<void>((_, reject) => { rejectRefresh = reject; });
    const presentations: string[] = [];
    const continuation = refresh.catch(() => {
      if (lifecycle.canPresentSubmitContinuation(stale)) presentations.push("stale-error");
    });

    lifecycle.onUnload();
    rejectRefresh(new Error("refresh failed"));
    await continuation;

    expect(presentations).toEqual([]);
  });

  test("a stale policy navigation rejection cannot present or unlock a newer navigation", async () => {
    const lifecycle = new LeadPageCoordinator();
    lifecycle.onShow();
    const stale = lifecycle.beginPolicyNavigation();
    expect(stale).not.toBeNull();
    if (!stale) return;
    let rejectNavigation!: (error: Error) => void;
    const navigation = new Promise<void>((_, reject) => { rejectNavigation = reject; });
    const presentations: string[] = [];
    const continuation = navigation.catch(() => {
      if (lifecycle.finishPolicyNavigation(stale)) presentations.push("stale-error");
    });

    lifecycle.onHide();
    lifecycle.onShow();
    const current = lifecycle.beginPolicyNavigation();
    expect(current).not.toBeNull();
    rejectNavigation(new Error("navigation failed"));
    await continuation;

    expect(presentations).toEqual([]);
    expect(lifecycle.beginPolicyNavigation()).toBeNull();
    expect(lifecycle.finishPolicyNavigation(current!)).toBe(true);
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
    expect(recordSmsCooldownUntil(cooldownUntil, 10, now)).toBe(cooldownUntil);
  });
});

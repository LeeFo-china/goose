import { describe, expect, test } from "bun:test";

import { ApiRequestError } from "../api/request";
import type { StoredSession } from "../models";
import { CustomerSessionManager } from "./customer-session";

describe("CustomerSessionManager", () => {
  test("returns persisted customer token before expiry", async () => {
    const session = new CustomerSessionManager({
      now: () => 1_000,
      readStoredCustomerSession: () => ({
        accessToken: "customer-token",
        expiresAt: 1_000 + 120_000,
      }),
      writeStoredCustomerSession: () => undefined,
      clearStoredCustomerSession: () => undefined,
    });

    await expect(session.getAccessToken()).resolves.toBe("customer-token");
    expect(session.isAuthenticated()).toBe(true);
  });

  test("clears and rejects expired or rejected customer tokens", async () => {
    let cleared = 0;
    const session = new CustomerSessionManager({
      now: () => 1_000,
      readStoredCustomerSession: () => ({
        accessToken: "expired-token",
        expiresAt: 1_001,
      }),
      writeStoredCustomerSession: () => undefined,
      clearStoredCustomerSession: () => { cleared += 1; },
    });

    await expect(session.getAccessToken()).rejects.toBeInstanceOf(ApiRequestError);
    await expect(session.refreshAfterUnauthorized("expired-token"))
      .rejects.toMatchObject({ code: "CUSTOMER_AUTH_REQUIRED" });
    expect(cleared).toBeGreaterThanOrEqual(1);
  });

  test("stores customer auth responses with an expiry", () => {
    const stored: StoredSession[] = [];
    const session = new CustomerSessionManager({
      now: () => 1_000,
      readStoredCustomerSession: () => stored[0] ?? null,
      writeStoredCustomerSession: (value) => { stored[0] = value; },
      clearStoredCustomerSession: () => { stored.length = 0; },
    });

    session.acceptAuth({ token: "new-token", expiresIn: 7200 });

    const storedSession = stored[0];
    expect(storedSession).toBeDefined();
    expect(storedSession.accessToken).toBe("new-token");
    expect(storedSession.expiresAt).toBe(7_201_000);
  });
});

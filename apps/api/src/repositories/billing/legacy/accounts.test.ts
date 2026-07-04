import { describe, expect, test } from "bun:test";

import { ensureAccount } from "./accounts";

describe("billing account repository", () => {
  test("unwraps billing_ensure_account rpc account payload", async () => {
    const account = {
      id: "account-1",
      tenant_id: "tenant-1",
      balance_credits: 2,
      frozen_credits: 0,
      available_credits: 2,
      total_recharged_credits: 1002,
      total_consumed_credits: 1000,
      status: "active",
      last_activity_at: "2026-07-04T04:13:33.919181+00:00",
      updated_at: "2026-07-04T04:13:33.919181+00:00",
    };
    const repository = {
      rpc(name: string, params: Record<string, unknown>) {
        expect(name).toBe("billing_ensure_account");
        expect(params).toEqual({ p_tenant_id: "tenant-1" });
        return Promise.resolve({
          data: { account },
          error: null,
        });
      },
    };

    await expect(ensureAccount.call(repository, "tenant-1")).resolves.toEqual(account);
  });
});

import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("BrandingVirtualRefundReconciliationRepository", () => {
  test("fails closed when finalize RPC does not return the exact terminal claim fact", async () => {
    const { BrandingVirtualRefundReconciliationRepository } = await import(
      "./branding-virtual-refund-reconciliation"
    );
    const repository = new BrandingVirtualRefundReconciliationRepository(() => ({
      rpc: async () => ({ data: {
        id: "11111111-1111-4111-8111-111111111111",
        status: "succeeded", compensation_status: "pending",
        reconcile_claim_token: null,
      }, error: null }),
    }));
    await expect(repository.finalize({
      refundId: "11111111-1111-4111-8111-111111111111",
      claimToken: "22222222-2222-4222-8222-222222222222",
      officialStatus: 5, refundFeeFen: 100, leftFeeFen: 0,
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test("accepts only exact success/failed terminal claim shapes", async () => {
    const { BrandingVirtualRefundReconciliationRepository } = await import(
      "./branding-virtual-refund-reconciliation"
    );
    const calls: Record<string, unknown>[] = [];
    const repository = new BrandingVirtualRefundReconciliationRepository(() => ({
      rpc: async (_name, input) => {
        calls.push(input);
        const succeeded = input.p_official_status !== 7;
        return { data: {
          id: input.p_refund_id, status: succeeded ? "succeeded" : "failed",
          compensation_status: "pending",
          reconcile_claim_token: succeeded ? input.p_claim_token : null,
        }, error: null };
      },
    }));
    await repository.finalize({ refundId: "11111111-1111-4111-8111-111111111111",
      claimToken: "22222222-2222-4222-8222-222222222222",
      officialStatus: 5, refundFeeFen: 100, leftFeeFen: 0 });
    await repository.finalize({ refundId: "11111111-1111-4111-8111-111111111111",
      claimToken: "22222222-2222-4222-8222-222222222222",
      officialStatus: 7, refundFeeFen: 0, leftFeeFen: 100 });
    expect(calls).toHaveLength(2);
  });

  test("fails closed for oversized/bad claims and clamps non-finite limits", async () => {
    const { BrandingVirtualRefundReconciliationRepository } = await import(
      "./branding-virtual-refund-reconciliation"
    );
    const inputs: Record<string, unknown>[] = [];
    const repository = new BrandingVirtualRefundReconciliationRepository(() => ({
      rpc: async (_name, input) => {
        inputs.push(input);
        return { data: Array.from({ length: 101 }, () => ({})), error: null };
      },
    }));
    await expect(repository.claim({ limit: Number.NaN, leaseSeconds: Infinity }))
      .rejects.toMatchObject({ code: "DB_ERROR" });
    expect(inputs[0]).toMatchObject({ p_limit: 1, p_lease_seconds: 30 });
    const bad = new BrandingVirtualRefundReconciliationRepository(() => ({
      rpc: async () => ({ data: [{}], error: null }),
    }));
    await expect(bad.claim({ limit: 20, leaseSeconds: 120 }))
      .rejects.toMatchObject({ code: "DB_ERROR" });
  });
});

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const rpc = mock(async (): Promise<{
  data: string | number | null;
  error: { message: string } | null;
}> => ({ data: "applied", error: null }));
const maybeSingle = mock(async () => ({
  data: {
    id: applymentId,
    tenant_id: tenantId,
    status: "draft",
    draft_epoch: 4,
    draft_revision: 8,
  },
  error: null,
}));
const query = {
  select: mock(() => query),
  eq: mock(() => query),
  maybeSingle,
};

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: () => query,
      rpc,
    }),
  },
}));

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260724130000_add_wechat_pay_applyment_draft_epoch.sql",
);

describe("fenced monotonic WeChat Pay applyment draft revision", () => {
  beforeEach(() => {
    rpc.mockClear();
    maybeSingle.mockClear();
    rpc.mockImplementation(async () => ({ data: "applied", error: null }));
  });

  test("claims epochs atomically and guards the full draft with epoch plus revision", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ADD COLUMN draft_epoch bigint NOT NULL DEFAULT 0");
    expect(sql).toContain("ALTER COLUMN draft_epoch SET DEFAULT 1");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.claim_tenant_wechat_pay_applyment_draft_session",
    );
    expect(sql).toContain("draft_epoch = draft_epoch + 1");
    expect(sql).toContain("draft_revision = 0");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.update_tenant_wechat_pay_applyment_draft",
    );
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("p_epoch <> v_applyment.draft_epoch");
    expect(sql).toContain("p_revision <= v_applyment.draft_revision");
    expect(sql).toContain("RETURN 'stale'");
    expect(sql).toContain("draft_revision = p_revision");
    expect(sql).toContain(
      "sensitive_payload_ciphertext = v_patch.sensitive_payload_ciphertext",
    );
    expect(sql).toContain(
      "sensitive_payload_version = v_patch.sensitive_payload_version",
    );
    expect(sql).not.toContain(
      "INSERT INTO public.tenant_wechat_pay_applyment_events",
    );
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("TO service_role");
  });

  test("keeps the exact claimed epoch when hydration sees a newer session", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: 5,
      error: null,
    }));
    maybeSingle.mockImplementationOnce(async () => ({
      data: {
        id: applymentId,
        tenant_id: tenantId,
        status: "draft",
        draft_epoch: 6,
        draft_revision: 0,
      },
      error: null,
    }));
    const { WechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );

    const result = await new WechatPayApplymentRepository()
      .claimTenantDraftSession({ applymentId, tenantId, employeeId });

    expect(rpc).toHaveBeenCalledWith(
      "claim_tenant_wechat_pay_applyment_draft_session",
      {
        p_applyment_id: applymentId,
        p_tenant_id: tenantId,
        p_employee_id: employeeId,
      },
    );
    expect(result).toMatchObject({
      id: applymentId,
      draft_epoch: 5,
      draft_revision: 0,
    });
  });

  test("calls the draft CAS RPC and returns its applied/stale outcome with current detail", async () => {
    const { WechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );
    const repository = new WechatPayApplymentRepository();
    const patch = {
      merchant_short_name: "revision-8",
      sensitive_payload_ciphertext: "ciphertext-8",
    };

    const result = await repository.updateTenantDraftAtomically({
      applymentId,
      tenantId,
      employeeId,
      epoch: 4,
      revision: 8,
      patch,
    });

    expect(rpc).toHaveBeenCalledWith(
      "update_tenant_wechat_pay_applyment_draft",
      {
        p_applyment_id: applymentId,
        p_tenant_id: tenantId,
        p_employee_id: employeeId,
        p_epoch: 4,
        p_revision: 8,
        p_patch: patch,
      },
    );
    expect(result).toMatchObject({
      outcome: "applied",
      applyment: {
        id: applymentId,
        draft_revision: 8,
      },
    });
  });

  test("hydrates and returns the highest row for an idempotent or stale retry", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: "stale",
      error: null,
    }));
    const { WechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );

    const result = await new WechatPayApplymentRepository()
      .updateTenantDraftAtomically({
        applymentId,
        tenantId,
        employeeId,
        epoch: 3,
        revision: 7,
        patch: { merchant_short_name: "stale-7" },
      });

    expect(result.outcome).toBe("stale");
    expect(result.applyment.draft_revision).toBe(8);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });
});

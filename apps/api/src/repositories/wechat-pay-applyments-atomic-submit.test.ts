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
  data: string | null;
  error: { message: string } | null;
}> => ({ data: "submitted", error: null }));
const maybeSingle = mock(async () => ({
  data: {
    id: applymentId,
    tenant_id: tenantId,
    status: "submitted",
    submitted_at: "2026-07-23T13:30:00.000Z",
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
  "../../../../supabase/migrations/20260723133000_add_atomic_wechat_pay_applyment_submit.sql",
);
const atomicCreateMigrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260724170000_atomic_wechat_pay_applyment_create.sql",
);
const attachmentLookupMigrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260724173000_index_wechat_pay_applyment_attachments.sql",
);

describe("atomic tenant WeChat Pay applyment submit", () => {
  beforeEach(() => {
    rpc.mockClear();
    maybeSingle.mockClear();
    rpc.mockImplementation(async () => ({ data: "submitted", error: null }));
  });

  test("serializes one active draft and audits its creation atomically", () => {
    const sql = readFileSync(atomicCreateMigrationPath, "utf8");
    expect(sql).toContain(
      "CREATE UNIQUE INDEX tenant_wechat_pay_applyments_one_active_per_tenant_idx",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.create_tenant_wechat_pay_applyment",
    );
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(
      /INSERT INTO public\.tenant_wechat_pay_applyments[\s\S]+INSERT INTO public\.tenant_wechat_pay_applyment_events/,
    );
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
  });

  test("creates and hydrates a draft through only the atomic RPC", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: applymentId,
      error: null,
    }));
    const { WechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );
    const repository = new WechatPayApplymentRepository();

    await repository.createApplyment({
      id: applymentId,
      tenant_id: tenantId,
      application_no: "WPA202607240001",
      status: "draft",
      applyment_state: "draft",
      appid_binding_state: "not_bound",
      merchant_short_name: null,
      attachments: [],
      created_by_employee_id: employeeId,
      updated_by_employee_id: employeeId,
    }, {
      change_source: "manual_save",
      changed_fields: ["attachments"],
    });

    expect(rpc).toHaveBeenCalledWith(
      "create_tenant_wechat_pay_applyment",
      {
        p_applyment: expect.objectContaining({
          id: applymentId,
          tenant_id: tenantId,
        }),
        p_audit_metadata: {
          change_source: "manual_save",
          changed_fields: ["attachments"],
        },
      },
    );
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  test("indexes attachment ownership containment lookups", () => {
    const sql = readFileSync(attachmentLookupMigrationPath, "utf8");
    expect(sql).toContain("USING gin (attachments jsonb_path_ops)");
  });

  test("locks, transitions and audits in one restricted transaction", () => {
    const sql = readFileSync(migrationPath, "utf8");
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.submit_tenant_wechat_pay_applyment",
    );
    expect(sql).toContain("FOR UPDATE");
    expect(sql).toContain("auth.role() <> 'service_role'");
    expect(sql).toContain("p_idempotency_key IS DISTINCT FROM p_applyment_id");
    expect(sql).toContain(
      "v_applyment.updated_at IS DISTINCT FROM p_expected_updated_at",
    );
    expect(sql).toMatch(
      /UPDATE public\.tenant_wechat_pay_applyments[\s\S]+INSERT INTO public\.tenant_wechat_pay_applyment_events/,
    );
    expect(sql).toContain("'idempotency_key', p_idempotency_key");
    expect(sql).toContain("RETURN 'idempotent'");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("TO service_role");
  });

  test("calls only the atomic RPC and hydrates the tenant-scoped result", async () => {
    const { WechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );
    const repository = new WechatPayApplymentRepository();

    const result = await repository.submitTenantApplymentAtomically({
      applymentId,
      tenantId,
      employeeId,
      idempotencyKey: applymentId,
      remark: "资料已确认",
      expectedUpdatedAt: "2026-07-23T13:29:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith(
      "submit_tenant_wechat_pay_applyment",
      {
        p_applyment_id: applymentId,
        p_tenant_id: tenantId,
        p_employee_id: employeeId,
        p_idempotency_key: applymentId,
        p_remark: "资料已确认",
        p_expected_updated_at: "2026-07-23T13:29:00.000Z",
      },
    );
    expect(result).toMatchObject({
      id: applymentId,
      tenant_id: tenantId,
      status: "submitted",
    });
    expect(maybeSingle).toHaveBeenCalledTimes(1);
  });

  test("maps a locked non-editable state to a stable conflict", async () => {
    rpc.mockImplementationOnce(async () => ({
      data: null,
      error: {
        message: "WECHAT_PAY_APPLYMENT_NOT_EDITABLE",
      },
    }));
    const { WechatPayApplymentRepository } = await import(
      "./wechat-pay-applyments"
    );

    await expect(
      new WechatPayApplymentRepository().submitTenantApplymentAtomically({
        applymentId,
        tenantId,
        employeeId,
        idempotencyKey: applymentId,
        remark: null,
        expectedUpdatedAt: "2026-07-23T13:29:00.000Z",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "WECHAT_PAY_APPLYMENT_NOT_EDITABLE",
    });
  });
});

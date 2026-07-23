import { describe, expect, mock, test } from "bun:test";

import type {
  WechatPayApplymentEventInsert,
  WechatPayApplymentRecord,
  WechatPayApplymentUpdate,
} from "@/repositories/wechat-pay-applyments";
import type { WechatPayConfigRecord } from "@/repositories/wechat-pay-configs";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const tenantId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const applymentId = "33333333-3333-4333-8333-333333333333";
const authContext = {
  employeeId,
  tenantId,
  permissions: [{ code: "wechat_pay.applyment.submit", scope: "all" }],
} as AuthContext;

function draft(
  overrides: Partial<WechatPayApplymentRecord> = {},
): WechatPayApplymentRecord {
  return {
    id: applymentId,
    tenant_id: tenantId,
    status: "draft",
    applyment_state: "draft",
    draft_revision: 4,
    merchant_short_name: "revision-4",
    attachments: [],
    contact_type: "LEGAL",
    has_sensitive_payload: false,
    sensitive_payload_version: null,
    rejected_at: null,
    rejected_reason: null,
    updated_at: "2026-07-24T10:00:00.000Z",
    ...overrides,
  } as unknown as WechatPayApplymentRecord;
}

async function createHarness(current: WechatPayApplymentRecord) {
  const updateTenantDraftAtomically = mock(async (input: {
    revision: number;
    patch: WechatPayApplymentUpdate;
  }) => ({
    outcome: input.revision > current.draft_revision ? "applied" : "stale",
    applyment: input.revision > current.draft_revision
      ? {
        ...current,
        ...input.patch,
        draft_revision: input.revision,
      }
      : current,
  } as const));
  const insertEvent = mock(async (_input: WechatPayApplymentEventInsert) => ({
    id: "44444444-4444-4444-8444-444444444444",
  }) as never);
  const findSensitivePayloadById = mock(async () => null);
  const { WechatPayApplymentService } = await import("./wechat-pay-applyments");
  const service = new WechatPayApplymentService({
    repository: {
      findLatestByTenant: async () => current,
      findById: async () => current,
      findSensitivePayloadById,
      createApplyment: async () => current,
      updateApplyment: async () => current,
      updateTenantDraftAtomically,
      submitTenantApplymentAtomically: async () => current,
      activateConfigAtomically: async () => current,
      insertEvent,
      findEvents: async () => [],
      listApplyments: async () => ({
        list: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      }),
    },
    configRepository: {
      upsertWechatPayConfig: async () => ({} as WechatPayConfigRecord),
      updateWechatPayConfig: async () => ({} as WechatPayConfigRecord),
    },
    accessPolicyService: {
      assertTenantContext: () => tenantId,
      hasPermission: () => true,
    },
  });
  return {
    service,
    updateTenantDraftAtomically,
    insertEvent,
    findSensitivePayloadById,
  };
}

describe("WechatPayApplymentService draft revision", () => {
  test("same or lower revision is an idempotent no-op without sensitive reads or audit", async () => {
    const harness = await createHarness(draft());

    const result = await harness.service.updateDraft(authContext, applymentId, {
      merchant_short_name: "stale-value",
      identity_number: "41000019900101001X",
      draft_update_source: "autosave",
      draft_revision: 4,
    });

    expect(result.applyment).toMatchObject({
      draft_revision: 4,
      merchant_short_name: "revision-4",
    });
    expect(harness.updateTenantDraftAtomically).not.toHaveBeenCalled();
    expect(harness.findSensitivePayloadById).not.toHaveBeenCalled();
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("a higher revision advances even for a business no-op and does not create an audit event", async () => {
    const harness = await createHarness(draft());

    const result = await harness.service.updateDraft(authContext, applymentId, {
      merchant_short_name: "revision-4",
      draft_update_source: "autosave",
      draft_revision: 5,
    });

    expect(harness.updateTenantDraftAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        revision: 5,
        patch: expect.objectContaining({
          merchant_short_name: "revision-4",
        }),
      }),
    );
    expect(result.applyment?.draft_revision).toBe(5);
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("does not audit when the database rejects a delayed higher-built patch as stale", async () => {
    const current = draft();
    const harness = await createHarness(current);
    harness.updateTenantDraftAtomically.mockImplementationOnce(async () => ({
      outcome: "stale",
      applyment: draft({
        draft_revision: 6,
        merchant_short_name: "revision-6",
      }),
    }));

    const result = await harness.service.updateDraft(authContext, applymentId, {
      merchant_short_name: "delayed-revision-5",
      draft_update_source: "autosave",
      draft_revision: 5,
    });

    expect(result.applyment).toMatchObject({
      draft_revision: 6,
      merchant_short_name: "revision-6",
    });
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("allows one legacy baseline update but fails closed after revision mode starts", async () => {
    const baseline = await createHarness(draft({ draft_revision: 0 }));
    await baseline.service.updateDraft(authContext, applymentId, {
      remark: "旧版人工保存",
    });
    expect(baseline.updateTenantDraftAtomically).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 1 }),
    );

    const revisioned = await createHarness(draft({ draft_revision: 2 }));
    await expect(revisioned.service.updateDraft(authContext, applymentId, {
      remark: "过期旧版保存",
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_DRAFT_REVISION_REQUIRED",
      statusCode: 409,
    });
    expect(revisioned.updateTenantDraftAtomically).not.toHaveBeenCalled();
  });
});

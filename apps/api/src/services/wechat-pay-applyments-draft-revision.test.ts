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
    draft_epoch: 3,
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
    epoch: number;
    revision: number;
    patch: WechatPayApplymentUpdate;
  }) => ({
    outcome: input.epoch !== current.draft_epoch
      ? "stale_epoch"
      : input.revision <= current.draft_revision
      ? "same_or_older_revision"
      : "applied",
    applyment: input.epoch === current.draft_epoch &&
        input.revision > current.draft_revision
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
      claimTenantDraftSession: async () => ({
        ...current,
        draft_epoch: current.draft_epoch + 1,
        draft_revision: 0,
      }),
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
      draft_epoch: 3,
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
      draft_epoch: 3,
      draft_revision: 5,
    });

    expect(harness.updateTenantDraftAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        epoch: 3,
      revision: 5,
      patch: expect.objectContaining({
        merchant_short_name: "revision-4",
      }),
      auditMetadata: null,
    }),
  );
  expect(result.applyment?.draft_revision).toBe(5);
  expect(harness.insertEvent).not.toHaveBeenCalled();
});

  test("passes updated audit metadata into the atomic draft RPC without a second event write", async () => {
    const harness = await createHarness(draft());

    await harness.service.updateDraft(authContext, applymentId, {
      merchant_short_name: "revision-5",
      draft_update_source: "manual_save",
      draft_epoch: 3,
      draft_revision: 5,
    });

    expect(harness.updateTenantDraftAtomically).toHaveBeenCalledWith(
      expect.objectContaining({
        auditMetadata: expect.objectContaining({
          change_source: "manual_entry",
          changed_fields: ["merchant_short_name"],
        }),
      }),
    );
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("does not audit when the database rejects a delayed higher-built patch as same or older revision", async () => {
    const current = draft();
    const harness = await createHarness(current);
    harness.updateTenantDraftAtomically.mockImplementationOnce(async () => ({
      outcome: "same_or_older_revision",
      applyment: draft({
        draft_revision: 6,
        merchant_short_name: "revision-6",
      }),
    }));

    const result = await harness.service.updateDraft(authContext, applymentId, {
      merchant_short_name: "delayed-revision-5",
      draft_update_source: "autosave",
      draft_epoch: 3,
      draft_revision: 5,
    });

    expect(result.applyment).toMatchObject({
      draft_revision: 6,
      merchant_short_name: "revision-6",
    });
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("fails closed for legacy update calls without fencing metadata", async () => {
    const harness = await createHarness(draft({ draft_revision: 0 }));
    await expect(harness.service.updateDraft(authContext, applymentId, {
      remark: "过期旧版保存",
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_DRAFT_FENCE_REQUIRED",
      statusCode: 409,
    });
    expect(harness.updateTenantDraftAtomically).not.toHaveBeenCalled();
  });

  test("rejects a higher preallocated revision from an older epoch before sensitive reads", async () => {
    const harness = await createHarness(draft({
      draft_epoch: 8,
      draft_revision: 1,
      merchant_short_name: "new-page",
    }));

    await expect(
      harness.service.updateDraft(authContext, applymentId, {
        merchant_short_name: "old-page-revision-99",
        identity_number: "41000019900101001X",
        draft_update_source: "autosave",
        draft_epoch: 7,
        draft_revision: 99,
      }),
    ).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_DRAFT_SESSION_STALE",
      statusCode: 409,
    });
    expect(harness.updateTenantDraftAtomically).not.toHaveBeenCalled();
    expect(harness.findSensitivePayloadById).not.toHaveBeenCalled();
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("rejects a stale epoch detected by the locked RPC without auditing", async () => {
    const harness = await createHarness(draft());
    harness.updateTenantDraftAtomically.mockImplementationOnce(async () => ({
      outcome: "stale_epoch",
      applyment: draft({
        draft_epoch: 4,
        draft_revision: 0,
        merchant_short_name: "other-page",
      }),
    }));

    await expect(
      harness.service.updateDraft(authContext, applymentId, {
        merchant_short_name: "racing-page",
        draft_update_source: "manual_save",
        draft_epoch: 3,
        draft_revision: 5,
      }),
    ).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_DRAFT_SESSION_STALE",
      statusCode: 409,
    });
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });

  test("claims a higher database epoch and resets the per-session revision", async () => {
    const harness = await createHarness(draft({
      draft_epoch: 8,
      draft_revision: 99,
    }));

    const result = await harness.service.claimDraftSession(
      authContext,
      applymentId,
    );

    expect(result.applyment).toMatchObject({
      draft_epoch: 9,
      draft_revision: 0,
    });
    expect(harness.insertEvent).not.toHaveBeenCalled();
  });
});

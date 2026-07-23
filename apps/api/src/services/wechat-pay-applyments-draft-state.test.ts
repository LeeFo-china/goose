import { expect, mock, test } from "bun:test";

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
const updatedAt = "2026-07-23T13:30:00.000Z";
const reviewedAttachment = {
  category: "license_copy" as const,
  file_object_id: "77777777-7777-4777-8777-777777777777",
  object_key: `tenants/${tenantId}/wechat-pay/${applymentId}/license.jpg`,
  file_name: "license.jpg",
  content_type: "image/jpeg",
  size: 1024,
  ocr_recognition_id: "66666666-6666-4666-8666-666666666666",
  ocr_review_status: "confirmed" as const,
};

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
    draft_revision: 0,
    remark: "未变备注",
    attachments: [],
    contact_type: "LEGAL",
    has_sensitive_payload: false,
    sensitive_payload_version: null,
    rejected_at: null,
    rejected_reason: null,
    updated_at: updatedAt,
    ...overrides,
  } as unknown as WechatPayApplymentRecord;
}

async function createHarness(current: WechatPayApplymentRecord) {
  const updateTenantDraftAtomically = mock(async (input: {
    revision: number;
    patch: WechatPayApplymentUpdate;
  }) => ({
    outcome: "applied" as const,
    applyment: {
      ...current,
      ...input.patch,
      draft_revision: input.revision,
    } as WechatPayApplymentRecord,
  }));
  const insertEvent = mock(async (_input: WechatPayApplymentEventInsert) => ({
    id: "44444444-4444-4444-8444-444444444444",
  }) as never);
  const findEvents = mock(async () => []);
  const { WechatPayApplymentService } = await import("./wechat-pay-applyments");
  const service = new WechatPayApplymentService({
    repository: {
      findLatestByTenant: async () => current,
      findById: async () => current,
      findSensitivePayloadById: async () => null,
      createApplyment: async () => current,
      updateApplyment: async () => current,
      updateTenantDraftAtomically,
      submitTenantApplymentAtomically: async () => current,
      activateConfigAtomically: async () => current,
      insertEvent,
      findEvents,
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
    updateApplyment: updateTenantDraftAtomically,
    insertEvent,
    findEvents,
  };
}

test("audits rejected state reset even when autosave data is unchanged", async () => {
  const rejectedReason = "请补充许可证照片";
  const harness = await createHarness(draft({
    status: "rejected",
    applyment_state: "rejected",
    rejected_at: "2026-07-01T10:00:00.000Z",
    rejected_reason: rejectedReason,
  }));

  await harness.service.updateDraft(authContext, applymentId, {
    remark: "未变备注",
    draft_update_source: "autosave",
  });

  expect(harness.updateApplyment.mock.calls[0]?.[0]?.patch).toEqual(
    expect.objectContaining({
      status: "draft",
      applyment_state: "draft",
      rejected_at: null,
      rejected_reason: null,
    }),
  );
  const metadata = harness.insertEvent.mock.calls[0]?.[0]?.metadata;
  expect(metadata).toEqual({
    changed_fields: [
      "applyment_state",
      "rejected_at",
      "rejected_reason",
      "status",
    ],
    change_source: "manual_entry",
    has_sensitive_replacement: false,
    forced_audit: true,
  });
  expect(JSON.stringify(metadata)).not.toContain(rejectedReason);
});

test("audits wechat editing state reset when autosave data is unchanged", async () => {
  const harness = await createHarness(draft({
    status: "wechat_editing",
    applyment_state: "APPLYMENT_STATE_EDITTING",
  }));

  await harness.service.updateDraft(authContext, applymentId, {
    remark: "未变备注",
    draft_update_source: "autosave",
  });

  expect(harness.insertEvent.mock.calls[0]?.[0]?.metadata).toEqual({
    changed_fields: ["applyment_state", "status"],
    change_source: "manual_entry",
    has_sensitive_replacement: false,
    forced_audit: true,
  });
});

test("reserves the revision for a new empty attachments business no-op", async () => {
  const harness = await createHarness(draft());

  const result = await harness.service.updateDraft(authContext, applymentId, {
    remark: "未变备注",
    attachments: [],
    draft_update_source: "autosave",
  });

  expect(result.applyment?.id).toBe(applymentId);
  expect(result.applyment?.updated_at).toBe(updatedAt);
  expect(harness.updateApplyment).toHaveBeenCalledTimes(1);
  expect(result.applyment?.draft_revision).toBe(1);
  expect(harness.insertEvent).not.toHaveBeenCalled();
  expect(harness.findEvents).toHaveBeenCalledWith({ tenantId, applymentId });
});

test("reserves the revision for a copied reviewed attachments business no-op", async () => {
  const harness = await createHarness(draft({
    attachments: [reviewedAttachment],
  }));

  const result = await harness.service.updateDraft(authContext, applymentId, {
    remark: "未变备注",
    attachments: [{ ...reviewedAttachment }],
    draft_update_source: "autosave",
  });

  expect(result.applyment?.updated_at).toBe(updatedAt);
  expect(harness.updateApplyment).toHaveBeenCalledTimes(1);
  expect(result.applyment?.draft_revision).toBe(1);
  expect(harness.insertEvent).not.toHaveBeenCalled();
});

test("audits an actual attachment review metadata change", async () => {
  const harness = await createHarness(draft({
    attachments: [{
      ...reviewedAttachment,
      ocr_recognition_id: null,
      ocr_review_status: "uploaded",
    }],
  }));

  await harness.service.updateDraft(authContext, applymentId, {
    attachments: [{
      ...reviewedAttachment,
      ocr_recognition_id: null,
      ocr_review_status: "manual",
    }],
    draft_update_source: "autosave",
  });

  expect(harness.updateApplyment).toHaveBeenCalledTimes(1);
  expect(harness.insertEvent.mock.calls[0]?.[0]?.metadata).toEqual({
    changed_fields: ["attachments"],
    change_source: "manual_entry",
    has_sensitive_replacement: false,
    forced_audit: true,
  });
});

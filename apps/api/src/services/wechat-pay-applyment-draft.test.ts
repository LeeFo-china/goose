import { describe, expect, test } from "bun:test";

import type {
  WechatPayApplymentRecord,
  WechatPayApplymentSensitiveRecord,
} from "@/repositories/wechat-pay-applyments";
import {
  buildDraftAuditDecision,
  buildDraftChangeAudit,
} from "@/services/wechat-pay-applyment-draft-audit";
import {
  buildSensitivePayloadUpdate,
} from "@/services/wechat-pay-applyment-draft";
import { decryptApplymentSensitivePayload } from "@/services/wechat-pay-applyment-sensitive-payload";

const tenantId = "11111111-1111-4111-8111-111111111111";
const applymentId = "33333333-3333-4333-8333-333333333333";
const rootSecret = "draft-helper-test-root-secret";
const current = {
  id: applymentId,
  tenant_id: tenantId,
  status: "draft",
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
  contact_type: "LEGAL",
  attachments: [],
  has_sensitive_payload: false,
  sensitive_payload_version: null,
} as unknown as WechatPayApplymentRecord;

describe("WeChat Pay applyment draft helpers", () => {
  test("derives forced audit from server-observed high-risk changes", () => {
    expect(buildDraftAuditDecision({
      current,
      input: {
        remark: "普通自动保存",
        draft_update_source: "autosave",
      },
    })).toEqual({
      should_audit: false,
      metadata: {
        changed_fields: ["remark"],
        change_source: "autosave",
        has_sensitive_replacement: false,
      },
    });
    expect(buildDraftAuditDecision({
      current,
      input: {
        contact_type: "SUPER",
        draft_update_source: "autosave",
      },
    })).toEqual({
      should_audit: true,
      metadata: {
        changed_fields: ["contact_type"],
        change_source: "manual_entry",
        has_sensitive_replacement: false,
        forced_audit: true,
      },
    });
    expect(buildDraftAuditDecision({
      current,
      input: {
        attachments: [],
        super_admin_phone: "13900000000",
        draft_update_source: "autosave",
      },
    })).toMatchObject({
      should_audit: true,
      metadata: {
        change_source: "manual_entry",
        has_sensitive_replacement: true,
        forced_audit: true,
      },
    });
    for (const input of [
      { subject_type: "SUBJECT_TYPE_INDIVIDUAL" as const },
      { settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL" as const },
    ]) {
      expect(buildDraftAuditDecision({
        current,
        input: { ...input, draft_update_source: "autosave" },
      }).should_audit).toBe(true);
    }
    expect(buildDraftAuditDecision({
      current,
      input: {
        attachments: [{
          category: "license_copy",
          file_object_id: "77777777-7777-4777-8777-777777777777",
          object_key: "tenants/tenant-1/license.jpg",
          ocr_recognition_id: "66666666-6666-4666-8666-666666666666",
          ocr_review_status: "confirmed",
        }],
        draft_update_source: "autosave",
      },
    })).toMatchObject({
      should_audit: true,
      metadata: {
        changed_fields: ["attachments"],
        change_source: "ocr_confirm",
        forced_audit: true,
      },
    });
  });

  test("forces autosave audit for subject, identity, and contact document changes", () => {
    for (const input of [
      { license_code: "91411525MA11111111" },
      { contact_identity_period_begin: "2026-07-23" },
    ]) {
      expect(buildDraftAuditDecision({
        current,
        input: { ...input, draft_update_source: "autosave" },
      })).toMatchObject({
        should_audit: true,
        metadata: {
          changed_fields: [Object.keys(input)[0]],
          change_source: "manual_entry",
          has_sensitive_replacement: false,
          forced_audit: true,
        },
      });
    }
  });

  test("derives sensitive replacement metadata from every encrypted input field", () => {
    for (const [field, value] of [
      ["super_admin_name", "李四"],
      ["super_admin_email", "admin@example.com"],
      ["settlement_account_name", "示例企业有限公司"],
    ] as const) {
      expect(buildDraftChangeAudit({ [field]: value })).toMatchObject({
        changed_fields: [field],
        has_sensitive_replacement: true,
      });
    }
  });

  test("does not audit a low-risk autosave without an actual value change", () => {
    expect(buildDraftAuditDecision({
      current: { ...current, remark: "未变备注" },
      input: {
        remark: "未变备注",
        draft_update_source: "autosave",
      },
    })).toEqual({
      should_audit: false,
      metadata: {
        changed_fields: [],
        change_source: "autosave",
        has_sensitive_replacement: false,
      },
    });
  });

  test("derives attachment source only from attachments that actually changed", () => {
    const confirmedAttachment = {
      category: "license_copy" as const,
      file_object_id: "77777777-7777-4777-8777-777777777777",
      object_key: "tenants/tenant-1/license.jpg",
      ocr_recognition_id: "66666666-6666-4666-8666-666666666666",
      ocr_review_status: "confirmed" as const,
    };
    const pendingAttachment = {
      category: "legal_representative_id_card_front" as const,
      file_object_id: "88888888-8888-4888-8888-888888888888",
      object_key: "tenants/tenant-1/id-front.jpg",
      ocr_recognition_id: null,
      ocr_review_status: "uploaded" as const,
    };

    expect(buildDraftAuditDecision({
      current: {
        ...current,
        attachments: [confirmedAttachment, pendingAttachment],
      },
      input: {
        attachments: [
          confirmedAttachment,
          { ...pendingAttachment, ocr_review_status: "manual" },
        ],
        draft_update_source: "autosave",
      },
    })).toMatchObject({
      should_audit: true,
      metadata: {
        changed_fields: ["attachments"],
        change_source: "manual_entry",
        has_sensitive_replacement: false,
        forced_audit: true,
      },
    });
  });

  test("initializes only an unflagged draft and fails closed on corrupt storage", async () => {
    const initialized = await buildSensitivePayloadUpdate({
      current,
      input: { identity_name: "张三" },
      tenantId,
      loadSensitivePayload: async () => null,
      rootSecret,
      now: "2026-07-23T13:30:00.000Z",
    });
    expect(initialized.sensitive_payload_version).toBe(1);
    expect(decryptApplymentSensitivePayload({
      context: { tenantId, applymentId, version: 1 },
      ciphertext: initialized.sensitive_payload_ciphertext ?? "",
      rootSecret,
    })).toEqual({ identity_name: "张三" });

    const corrupt = {
      ...current,
      has_sensitive_payload: true,
      sensitive_payload_version: 1,
    };
    await expect(buildSensitivePayloadUpdate({
      current: corrupt,
      input: { identity_name: "张三" },
      tenantId,
      loadSensitivePayload: async () => ({
        id: applymentId,
        tenant_id: tenantId,
        has_sensitive_payload: true,
        sensitive_payload_ciphertext: null,
        sensitive_payload_version: 1,
      } satisfies WechatPayApplymentSensitiveRecord),
      rootSecret,
      now: "2026-07-23T13:30:00.000Z",
    })).rejects.toMatchObject({
      code: "WECHAT_PAY_APPLYMENT_SENSITIVE_PAYLOAD_CORRUPTED",
    });
  });
});

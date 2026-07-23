import { describe, expect, test } from "bun:test";

import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";
import {
  buildWechatPayApplymentPartialDraftPayload,
  buildWechatPayApplymentPayload,
} from "./finance-wechat-pay-applyment-schema";

const contactAttachment: WechatPayApplymentAttachment = {
  category: "contact_id_card_front",
  object_key: "tenants/tenant-1/contact-front.jpg",
  file_object_id: "11111111-1111-4111-8111-111111111111",
};

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("buildWechatPayApplymentPayload", () => {
  test("builds a shell draft without blank strings", () => {
    const payload = buildWechatPayApplymentPartialDraftPayload(
      new FormData(),
      {
        attachments: [contactAttachment],
      },
    );

    expect(payload).toMatchObject({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      contact_type: "LEGAL",
      merchant_short_name: null,
      attachments: [],
    });
    expect(Object.values(payload)).not.toContain("");
    expect(payload).not.toHaveProperty("identity_doc_type");
  });

  test("uses null for blank safe fields and omits blank sensitive replacements", () => {
    const payload = buildWechatPayApplymentPartialDraftPayload(formData({
      subject_type: "SUBJECT_TYPE_INDIVIDUAL",
      contact_type: "SUPER",
      merchant_short_name: " ",
      service_phone: "",
      identity_number: "",
      settlement_account_number: "",
    }), {
      attachments: [],
    });

    expect(payload).toMatchObject({
      subject_type: "SUBJECT_TYPE_INDIVIDUAL",
      contact_type: "SUPER",
      merchant_short_name: null,
      service_phone: null,
      attachments: [],
    });
    expect(payload).not.toHaveProperty("identity_number");
    expect(payload).not.toHaveProperty("settlement_account_number");
    expect(Object.values(payload)).not.toContain("");
  });

  test("keeps OCR values and confirmed metadata atomic in one checkpoint", () => {
    const confirmedAttachment: WechatPayApplymentAttachment = {
      category: "license_copy",
      object_key: "tenants/tenant-1/license.jpg",
      file_object_id: "22222222-2222-4222-8222-222222222222",
      ocr_recognition_id: "33333333-3333-4333-8333-333333333333",
      ocr_review_status: "confirmed",
    };

    const payload = buildWechatPayApplymentPartialDraftPayload(formData({
      license_name: "识别后的主体名称",
      identity_number: "",
    }), {
      attachments: [confirmedAttachment],
    });

    expect(payload).toEqual({
      license_name: "识别后的主体名称",
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      contact_type: "LEGAL",
      attachments: [confirmedAttachment],
      business_scene_description: null,
      contact_address: null,
      identity_period_begin: null,
      identity_period_end: null,
      legal_representative_name: null,
      license_address: null,
      license_code: null,
      license_period_begin: null,
      license_period_end: null,
      merchant_short_name: null,
      qualification_type: null,
      remark: null,
      service_phone: null,
      settlement_account_name: null,
      settlement_account_type: null,
      settlement_bank_branch_id: null,
      settlement_bank_full_name: null,
      settlement_bank_name: null,
      settlement_id: null,
      super_admin_email: null,
      super_admin_name: null,
    });
    expect(payload.attachments).toEqual([
      expect.objectContaining({
        ocr_recognition_id: "33333333-3333-4333-8333-333333333333",
        ocr_review_status: "confirmed",
      }),
    ]);
    expect(payload.attachments).toEqual([
      expect.not.objectContaining({
        fields: expect.anything(),
        warnings: expect.anything(),
      }),
    ]);
  });

  test("clears agent-only fields and attachments in a partial LEGAL draft", () => {
    const payload = buildWechatPayApplymentPartialDraftPayload(formData({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      contact_type: "SUPER",
      contact_identity_number: "41000019900101001X",
      contact_identity_address: "河南省信阳市",
      contact_identity_period_begin: "2020-01-01",
      contact_identity_period_end: "长期",
    }), {
      attachments: [contactAttachment],
      contactType: "LEGAL",
    });

    expect(payload.contact_type).toBe("LEGAL");
    expect(payload).not.toHaveProperty("contact_identity_number");
    expect(payload).not.toHaveProperty("contact_identity_address");
    expect(payload).not.toHaveProperty("contact_identity_period_begin");
    expect(payload).not.toHaveProperty("contact_identity_period_end");
    expect(payload.attachments).toEqual([]);
  });

  test("omits blank sensitive replacements for an encrypted draft", () => {
    const payload = buildWechatPayApplymentPayload(formData({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      contact_type: "LEGAL",
      merchant_short_name: "晴天装饰",
      identity_number: "",
      super_admin_phone: "",
      settlement_account_number: "",
    }), {
      hasSensitivePayload: true,
      attachments: [contactAttachment],
    });

    expect(payload).not.toHaveProperty("identity_number");
    expect(payload).not.toHaveProperty("super_admin_phone");
    expect(payload).not.toHaveProperty("settlement_account_number");
  });

  test("removes agent-only values and attachments for a legal contact", () => {
    const payload = buildWechatPayApplymentPayload(formData({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      contact_type: "LEGAL",
      contact_identity_number: "41000019900101001X",
      contact_identity_address: "河南省信阳市",
    }), {
      hasSensitivePayload: false,
      attachments: [contactAttachment],
    });

    expect(payload).not.toHaveProperty("contact_identity_number");
    expect(payload).not.toHaveProperty("contact_identity_address");
    expect(payload.attachments).toEqual([]);
  });

  test("includes new sensitive values for an agent contact", () => {
    const payload = buildWechatPayApplymentPayload(formData({
      subject_type: "SUBJECT_TYPE_INDIVIDUAL",
      contact_type: "SUPER",
      identity_number: "41000019900101001x",
      super_admin_phone: "13800000000",
      settlement_account_number: "6222020000000000",
      contact_identity_number: "41000019900101002x",
      contact_identity_address: "河南省信阳市",
    }), {
      hasSensitivePayload: false,
      attachments: [contactAttachment],
    });

    expect(payload).toMatchObject({
      identity_number: "41000019900101001X",
      super_admin_phone: "13800000000",
      settlement_account_number: "6222020000000000",
      contact_identity_number: "41000019900101002X",
      contact_identity_address: "河南省信阳市",
      attachments: [contactAttachment],
    });
  });

  test("keeps OCR file identity and normalized sensitive suggestions in the existing payload", () => {
    const payload = buildWechatPayApplymentPayload(formData({
      subject_type: "SUBJECT_TYPE_INDIVIDUAL",
      contact_type: "SUPER",
      identity_number: "41000019900101001x",
      contact_identity_number: "41000019900101002x",
      settlement_account_number: "6222020000000000",
    }), {
      hasSensitivePayload: false,
      attachments: [contactAttachment],
    });

    expect(payload).toMatchObject({
      identity_number: "41000019900101001X",
      contact_identity_number: "41000019900101002X",
      settlement_account_number: "6222020000000000",
      attachments: [contactAttachment],
    });
  });
});

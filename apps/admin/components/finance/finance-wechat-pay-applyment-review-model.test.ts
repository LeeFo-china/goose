import { describe, expect, test } from "bun:test";

import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";
import {
  buildWechatPayApplymentSubmissionData,
  getWechatPayApplymentReviewTargets,
} from "./finance-wechat-pay-applyment-review-model";

const attachments: WechatPayApplymentAttachment[] = [{
  category: "license_copy",
  object_key: "tenants/tenant-1/license.jpg",
  file_object_id: "11111111-1111-4111-8111-111111111111",
  ocr_review_status: "confirmed",
}];

function formData(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe("wechat pay applyment review model", () => {
  test("builds the review and submit payload from the same live form values", () => {
    const submission = buildWechatPayApplymentSubmissionData(
      formData({
        subject_type: "SUBJECT_TYPE_ENTERPRISE",
        license_name: "刚确认的识别主体",
        license_code: "91410000CURRENT",
        identity_name: "证件姓名王小明",
        identity_number: "41000019900101001x",
        identity_address: "河南省测试市测试区一号",
        legal_representative_name: "当前法人",
        contact_type: "LEGAL",
        super_admin_name: "当前管理员",
        super_admin_phone: "13800001234",
        super_admin_email: "current@example.com",
        merchant_short_name: "未保存的新简称",
        settlement_account_name: "当前结算户名",
        settlement_account_number: "6222020000001234",
        settlement_bank_name: "当前开户银行",
      }),
      {
        applyment: {
          license_name: "服务端旧主体",
          merchant_short_name: "服务端旧简称",
          super_admin_phone_masked: "139****9999",
          settlement_account_number_masked: "6214••••8888",
        },
        hasSensitivePayload: true,
        attachments,
      },
    );

    expect(submission.payload).toMatchObject({
      license_name: "刚确认的识别主体",
      merchant_short_name: "未保存的新简称",
      super_admin_phone: "13800001234",
      settlement_account_number: "6222020000001234",
      attachments,
    });
    expect(submission.review.subject).toContain("刚确认的识别主体");
    expect(submission.review.subject).not.toContain("服务端旧主体");
    expect(submission.review.settlement).toContain("未保存的新简称");
    expect(submission.review.settlement).not.toContain("服务端旧简称");
    expect(submission.review.contact).toContain("138****1234");
    expect(submission.review.contact).not.toContain("13800001234");
    expect(submission.review.subject).toContain("证**");
    expect(submission.review.subject).not.toContain("证件姓名王小明");
    expect(submission.review.subject).toContain("410000********001X");
    expect(submission.review.subject).not.toContain("41000019900101001X");
    expect(submission.review.subject).toContain("河南省测试市••••");
    expect(submission.review.subject).not.toContain("河南省测试市测试区一号");
    expect(submission.review.settlement).toContain("6222••••1234");
    expect(submission.review.settlement).not.toContain("6222020000001234");
  });

  test("updates summaries when pending form values change before saving", () => {
    const options = {
      applyment: { merchant_short_name: "服务端简称" },
      hasSensitivePayload: false,
      attachments,
    };
    const before = buildWechatPayApplymentSubmissionData(
      formData({
        contact_type: "LEGAL",
        merchant_short_name: "修改前",
      }),
      options,
    );
    const after = buildWechatPayApplymentSubmissionData(
      formData({
        contact_type: "LEGAL",
        merchant_short_name: "修改后",
      }),
      options,
    );

    expect(before.review.settlement).toContain("修改前");
    expect(after.review.settlement).toContain("修改后");
    expect(after.payload.merchant_short_name).toBe("修改后");
  });

  test("returns to the exact stage and OCR category for each review section", () => {
    expect(getWechatPayApplymentReviewTargets("LEGAL")).toEqual({
      subject: { stage: "recognition", ocrCategory: "license_copy" },
      contact: {
        stage: "recognition",
        ocrCategory: "legal_representative_id_card_front",
      },
      settlement: { stage: "supplement" },
      attachments: { stage: "materials" },
    });
    expect(getWechatPayApplymentReviewTargets("SUPER").contact).toEqual({
      stage: "recognition",
      ocrCategory: "contact_id_card_front",
    });
  });
});

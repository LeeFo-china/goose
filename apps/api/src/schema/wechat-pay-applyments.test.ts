import { describe, expect, test } from "bun:test";
import {
  ActivateWechatPayApplymentConfigSchema,
  CreateWechatPayApplymentSchema,
  PlatformWechatPayApplymentListQuerySchema,
  RepairWechatPayApplymentStateSchema,
  RejectWechatPayApplymentSchema,
  SubmitWechatPayApplymentSchema,
  UpdateWechatPayApplymentSchema,
} from "./wechat-pay-applyments";

const baseApplymentInput = {
  subject_type: "SUBJECT_TYPE_ENTERPRISE",
  merchant_short_name: " 固始晴天装饰 ",
  license_name: "固始晴天装饰工程有限公司",
  license_code: "91411525MA00000000",
  license_address: "河南省信阳市固始县示例大道1号",
  license_period_begin: "2020-01-01",
  license_period_end: "长期",
  legal_representative_name: "张三",
  identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
  identity_name: "张三",
  identity_number: "41000019900101001X",
  identity_address: "河南省信阳市固始县示例路1号",
  identity_period_begin: "2020-01-01",
  identity_period_end: "2040-01-01",
  contact_type: "LEGAL",
  super_admin_name: "李四",
  super_admin_phone: "13800000000",
  super_admin_email: "admin@example.com",
  service_phone: "0376-1234567",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
  settlement_account_name: "固始晴天装饰工程有限公司",
  settlement_bank_name: "中国银行",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_branch_id: "104515080123",
  settlement_account_number: "6212345678901234",
  settlement_id: "716",
  qualification_type: "零售批发/生活娱乐/网上商城/其他",
  business_scene_description: "装修项目收款",
  contact_address: "河南省信阳市固始县",
  attachments: [
    {
      category: "license_copy",
      object_key: "tenants/tenant-1/wechat-pay-applyment/unassigned/2026/07/02/license.jpg",
      file_name: "营业执照.jpg",
      content_type: "image/jpeg",
      size: 120000,
    },
  ],
  remark: "首次申请",
};

describe("wechat pay applyment schemas", () => {
  test("accepts safe tenant applyment input and strips full phone from persistence shape", () => {
    const result = CreateWechatPayApplymentSchema.safeParse(baseApplymentInput);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.merchant_short_name).toBe("固始晴天装饰");
    expect(result.data.super_admin_phone).toBe("13800000000");
    expect(result.data.settlement_account_type).toBe("BANK_ACCOUNT_TYPE_CORPORATE");
    expect(result.data.settlement_account_number).toBe("6212345678901234");
    expect(result.data.attachments?.[0]?.category).toBe("license_copy");
  });

  test("persists the uploaded file identity with applyment attachments", () => {
    const fileObjectId = "11111111-1111-4111-8111-111111111111";
    const result = CreateWechatPayApplymentSchema.safeParse({
      ...baseApplymentInput,
      attachments: [{
        ...baseApplymentInput.attachments[0],
        file_object_id: fileObjectId,
      }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.attachments?.[0]?.file_object_id).toBe(fileObjectId);
    expect(CreateWechatPayApplymentSchema.safeParse({
      ...baseApplymentInput,
      attachments: [{
        ...baseApplymentInput.attachments[0],
        file_object_id: "not-a-uuid",
      }],
    }).success).toBe(false);
  });

  test("rejects invalid bank account number for tenant applyment input", () => {
    const result = CreateWechatPayApplymentSchema.safeParse({
      ...baseApplymentInput,
      settlement_account_number: "abc123",
    });

    expect(result.success).toBe(false);
  });

  test("accepts an incomplete draft but validates fields that are present", () => {
    expect(CreateWechatPayApplymentSchema.safeParse({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      contact_type: "LEGAL",
      attachments: [],
      draft_update_source: "autosave",
      draft_revision: 1,
    }).success).toBe(true);
    expect(CreateWechatPayApplymentSchema.safeParse({
      identity_number: "bad-id",
    }).success).toBe(false);
    expect(CreateWechatPayApplymentSchema.safeParse({
      merchant_short_name: null,
    }).success).toBe(true);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      merchant_short_name: null,
      draft_update_source: "autosave",
      draft_epoch: 2,
      draft_revision: 2,
    }).success).toBe(true);
    expect(CreateWechatPayApplymentSchema.safeParse({
      draft_update_source: "autosave",
      draft_revision: 1,
    }).success).toBe(false);
  });

  test("requires a positive revision for revision-aware draft saves", () => {
    expect(UpdateWechatPayApplymentSchema.safeParse({
      remark: "最新草稿",
      draft_update_source: "autosave",
    }).success).toBe(false);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      remark: "最新草稿",
      draft_update_source: "autosave",
      draft_revision: 0,
    }).success).toBe(false);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      remark: "最新草稿",
      draft_update_source: "manual_save",
      draft_epoch: 3,
      draft_revision: 7,
    }).success).toBe(true);
  });

  test("fails closed for update clients without an epoch and revision", () => {
    expect(UpdateWechatPayApplymentSchema.safeParse({
      remark: "旧版人工更新",
    }).success).toBe(false);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      remark: "只有版本、没有会话 fencing",
      draft_update_source: "autosave",
      draft_revision: 99,
    }).success).toBe(false);
    expect(CreateWechatPayApplymentSchema.safeParse({
      remark: "新草稿由数据库签发初始 epoch",
      draft_update_source: "autosave",
      draft_revision: 1,
    }).success).toBe(true);
    expect(CreateWechatPayApplymentSchema.safeParse({
      remark: "创建时不接受客户端伪造 epoch",
      draft_update_source: "autosave",
      draft_epoch: 99,
      draft_revision: 1,
    }).success).toBe(false);
  });

  test("accepts attachment-only and atomic OCR confirmation checkpoints", () => {
    const confirmedAttachment = {
      category: "license_copy",
      object_key: "tenant/license.jpg",
      file_object_id: "22222222-2222-4222-8222-222222222222",
      ocr_recognition_id: "11111111-1111-4111-8111-111111111111",
      ocr_review_status: "confirmed",
    };

    expect(UpdateWechatPayApplymentSchema.safeParse({
      attachments: [{
        category: "license_copy",
        object_key: "tenant/license.jpg",
      }],
      draft_update_source: "attachment_change",
      draft_epoch: 4,
      draft_revision: 2,
    }).success).toBe(true);
    const confirmation = UpdateWechatPayApplymentSchema.safeParse({
      license_name: "识别后的主体名称",
      attachments: [confirmedAttachment],
      draft_update_source: "ocr_confirm",
      draft_epoch: 4,
      draft_revision: 3,
    });
    expect(confirmation.success).toBe(true);
    if (!confirmation.success) return;
    expect(confirmation.data).toMatchObject({
      license_name: "识别后的主体名称",
      attachments: [confirmedAttachment],
    });
  });

  test("allows only safe OCR review metadata on attachments", () => {
    const attachment = {
      category: "license_copy",
      file_object_id: "22222222-2222-4222-8222-222222222222",
      object_key: "tenant/license.jpg",
      ocr_recognition_id: "11111111-1111-4111-8111-111111111111",
      ocr_review_status: "confirmed",
    };
    expect(UpdateWechatPayApplymentSchema.safeParse({
      attachments: [attachment],
      draft_epoch: 2,
      draft_revision: 4,
    }).success).toBe(true);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      attachments: [{
        ...attachment,
        ocr_recognition_id: "not-a-uuid",
      }],
    }).success).toBe(false);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      attachments: [{
        ...attachment,
        ocr_review_status: "unknown",
      }],
    }).success).toBe(false);
    expect(UpdateWechatPayApplymentSchema.safeParse({
      attachments: [{
        ...attachment,
        ocr_fields: { identity_number: "41000019900101001X" },
      }],
    }).success).toBe(false);
  });

  test("requires recognition identity for OCR-backed review states", () => {
    const attachment = {
      category: "license_copy",
      file_object_id: "22222222-2222-4222-8222-222222222222",
      object_key: "tenant/license.jpg",
    };
    for (const ocrReviewStatus of ["confirmed", "review_required"] as const) {
      expect(UpdateWechatPayApplymentSchema.safeParse({
        attachments: [{
          ...attachment,
          ocr_review_status: ocrReviewStatus,
        }],
      }).success).toBe(false);
    }
    expect(UpdateWechatPayApplymentSchema.safeParse({
      attachments: [{
        category: "license_copy",
        object_key: "tenant/license.jpg",
        ocr_review_status: "manual",
      }],
      draft_epoch: 2,
      draft_revision: 5,
    }).success).toBe(true);
  });

  test("rejects a settlement rule that does not belong to the subject", () => {
    const result = CreateWechatPayApplymentSchema.safeParse({
      ...baseApplymentInput,
      settlement_id: "719",
      qualification_type: "零售批发/生活娱乐/其他",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["settlement_id"],
        message: "请选择当前主体可用的结算规则",
      }),
    );
  });

  test("rejects an industry that does not match the settlement rule", () => {
    const result = CreateWechatPayApplymentSchema.safeParse({
      ...baseApplymentInput,
      qualification_type: "生活服务/家装服务",
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["qualification_type"],
        message: "所属行业与结算规则不匹配",
      }),
    );
  });

  test("validates only the settlement rule combinations present in a draft", () => {
    expect(
      UpdateWechatPayApplymentSchema.safeParse({
        settlement_id: "716",
        draft_epoch: 2,
        draft_revision: 6,
      })
        .success,
    ).toBe(true);
    expect(
      UpdateWechatPayApplymentSchema.safeParse({
        subject_type: "SUBJECT_TYPE_ENTERPRISE",
        settlement_id: "716",
        qualification_type: "零售批发/生活娱乐/网上商城/其他",
        draft_epoch: 2,
        draft_revision: 7,
      }).success,
    ).toBe(true);
    expect(
      UpdateWechatPayApplymentSchema.safeParse({
        subject_type: "SUBJECT_TYPE_INDIVIDUAL",
        settlement_id: null,
        qualification_type: null,
        draft_epoch: 2,
        draft_revision: 8,
      }).success,
    ).toBe(true);
    expect(
      UpdateWechatPayApplymentSchema.safeParse({
        subject_type: "SUBJECT_TYPE_INDIVIDUAL",
        settlement_id: "719",
        qualification_type: "零售批发/生活娱乐/其他",
        draft_epoch: 2,
        draft_revision: 9,
      }).success,
    ).toBe(true);
  });

  test("allows draft update without plaintext secret fields", () => {
    const result = UpdateWechatPayApplymentSchema.safeParse({
      merchant_short_name: "晴天装饰",
      api_v3_key: "plaintext-secret",
      private_key: "plaintext-key",
    });

    expect(result.success).toBe(false);
  });

  test("parses submit and platform list queries", () => {
    const submitResult = SubmitWechatPayApplymentSchema.safeParse({
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      remark: "资料已确认",
    });
    const listResult = PlatformWechatPayApplymentListQuerySchema.safeParse({
      page: "2",
      pageSize: "50",
      status: "submitted",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      keyword: "晴天",
    });

    expect(submitResult.success).toBe(true);
    expect(listResult.success).toBe(true);
    if (!listResult.success) return;
    expect(listResult.data.page).toBe(2);
    expect(listResult.data.pageSize).toBe(50);
  });

  test("requires a valid tenant submit idempotency key", () => {
    expect(SubmitWechatPayApplymentSchema.safeParse({}).success).toBe(false);
    expect(SubmitWechatPayApplymentSchema.safeParse({
      idempotency_key: "not-a-uuid",
    }).success).toBe(false);
    expect(SubmitWechatPayApplymentSchema.safeParse({
      idempotency_key: "11111111-1111-4111-8111-111111111111",
      remark: null,
    }).success).toBe(true);
  });

  test("validates platform review and empty activation payload", () => {
    const rejectResult = RejectWechatPayApplymentSchema.safeParse({
      reason: "结算账户摘要缺失",
    });
    const wechatStatusResult = RepairWechatPayApplymentStateSchema.safeParse({
      applyment_business_code: "APPLY-20260701-001",
      applyment_id: "2000002124775691",
      applyment_state: "opened",
      sub_mchid: "1900000002",
      sub_appid: "wx0000000000000000",
      appid_binding_state: "bound",
      appid_binding_message: "平台小程序已绑定",
      reason: "微信运营工单确认需要修复",
    });
    const activateResult = ActivateWechatPayApplymentConfigSchema.safeParse({});

    expect(rejectResult.success).toBe(true);
    expect(wechatStatusResult.success).toBe(true);
    expect(activateResult.success).toBe(true);
  });

  test("rejects caller-supplied credentials during activation", () => {
    const result = ActivateWechatPayApplymentConfigSchema.safeParse({
      merchant_id: "1900000109",
    });

    expect(result.success).toBe(false);
  });

  test("rejects unsupported applyment states and invalid pagination", () => {
    const stateResult = RepairWechatPayApplymentStateSchema.safeParse({
      applyment_state: "almost_opened",
      reason: "微信运营工单确认需要修复",
    });
    const listResult = PlatformWechatPayApplymentListQuerySchema.safeParse({
      pageSize: "101",
    });

    expect(stateResult.success).toBe(false);
    expect(listResult.success).toBe(false);
  });
});

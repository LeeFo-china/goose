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

  test("rejects invalid bank account number for tenant applyment input", () => {
    const result = CreateWechatPayApplymentSchema.safeParse({
      ...baseApplymentInput,
      settlement_account_number: "abc123",
    });

    expect(result.success).toBe(false);
  });

  test("requires official identity contact and settlement fields on create", () => {
    const requiredFields = [
      "subject_type",
      "identity_name",
      "identity_number",
      "identity_period_begin",
      "identity_period_end",
      "contact_type",
      "super_admin_email",
      "service_phone",
      "settlement_id",
      "qualification_type",
    ] as const;

    for (const field of requiredFields) {
      const input = { ...baseApplymentInput } as Record<string, unknown>;
      delete input[field];
      expect(CreateWechatPayApplymentSchema.safeParse(input).success).toBe(false);
    }
  });

  test("requires agent identity fields and attachments for SUPER contact", () => {
    const superContactInput = {
      ...baseApplymentInput,
      contact_type: "SUPER",
      contact_identity_doc_type: "IDENTIFICATION_TYPE_IDCARD",
      contact_identity_number: "41000019920202002X",
      contact_identity_address: "河南省信阳市固始县经办人路2号",
      contact_identity_period_begin: "2021-01-01",
      contact_identity_period_end: "2041-01-01",
      attachments: [
        ...baseApplymentInput.attachments,
        {
          category: "contact_id_card_front",
          object_key: "tenants/tenant-1/wechat-pay-applyment/contact-front.jpg",
        },
        {
          category: "contact_id_card_back",
          object_key: "tenants/tenant-1/wechat-pay-applyment/contact-back.jpg",
        },
      ],
    };

    expect(CreateWechatPayApplymentSchema.safeParse(superContactInput).success)
      .toBe(true);
    expect(
      CreateWechatPayApplymentSchema.safeParse({
        ...superContactInput,
        contact_identity_number: undefined,
      }).success,
    ).toBe(false);
    expect(
      CreateWechatPayApplymentSchema.safeParse({
        ...superContactInput,
        attachments: baseApplymentInput.attachments,
      }).success,
    ).toBe(false);
  });

  test("requires enterprise identity address and corporate bank account", () => {
    expect(
      CreateWechatPayApplymentSchema.safeParse({
        ...baseApplymentInput,
        identity_address: undefined,
      }).success,
    ).toBe(false);
    expect(
      CreateWechatPayApplymentSchema.safeParse({
        ...baseApplymentInput,
        settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
      }).success,
    ).toBe(false);

    expect(
      CreateWechatPayApplymentSchema.safeParse({
        ...baseApplymentInput,
        subject_type: "SUBJECT_TYPE_INDIVIDUAL",
        identity_address: undefined,
        settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
        settlement_id: "719",
        qualification_type: "零售批发/生活娱乐/其他",
      }).success,
    ).toBe(true);
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

  test("requires linked settlement fields together during draft update", () => {
    expect(
      UpdateWechatPayApplymentSchema.safeParse({ settlement_id: "716" })
        .success,
    ).toBe(false);
    expect(
      UpdateWechatPayApplymentSchema.safeParse({
        subject_type: "SUBJECT_TYPE_ENTERPRISE",
        settlement_id: "716",
        qualification_type: "零售批发/生活娱乐/网上商城/其他",
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

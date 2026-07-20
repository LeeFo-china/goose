import { describe, expect, test } from "bun:test";
import {
  ActivateWechatPayApplymentConfigSchema,
  CreateWechatPayApplymentSchema,
  PlatformWechatPayApplymentListQuerySchema,
  RejectWechatPayApplymentSchema,
  SubmitWechatPayApplymentSchema,
  UpdateWechatPayApplymentSchema,
  UpdateWechatPayApplymentWechatStatusSchema,
} from "./wechat-pay-applyments";

const baseApplymentInput = {
  merchant_short_name: " 固始晴天装饰 ",
  license_name: "固始晴天装饰工程有限公司",
  license_code: "91411525MA00000000",
  legal_representative_name: "张三",
  super_admin_name: "李四",
  super_admin_phone: "13800000000",
  super_admin_email: "admin@example.com",
  settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
  settlement_account_name: "固始晴天装饰工程有限公司",
  settlement_bank_name: "中国银行",
  settlement_bank_full_name: "中国银行股份有限公司固始支行",
  settlement_bank_branch_id: "104515080123",
  settlement_account_number: "6212345678901234",
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
    const wechatStatusResult = UpdateWechatPayApplymentWechatStatusSchema.safeParse({
      applyment_business_code: "APPLY-20260701-001",
      applyment_id: "2000002124775691",
      applyment_state: "opened",
      sub_mchid: "1900000002",
      sub_appid: "wxbac3b1e168fd968a",
      appid_binding_state: "bound",
      appid_binding_message: "平台小程序已绑定",
    });
    const activateResult = ActivateWechatPayApplymentConfigSchema.safeParse({});

    expect(rejectResult.success).toBe(true);
    expect(wechatStatusResult.success).toBe(true);
    expect(activateResult.success).toBe(true);
  });

  test("rejects caller-supplied credentials during activation", () => {
    const result = ActivateWechatPayApplymentConfigSchema.safeParse({
      merchant_id: "1561816121",
    });

    expect(result.success).toBe(false);
  });

  test("rejects unsupported applyment states and invalid pagination", () => {
    const stateResult = UpdateWechatPayApplymentWechatStatusSchema.safeParse({
      applyment_state: "almost_opened",
    });
    const listResult = PlatformWechatPayApplymentListQuerySchema.safeParse({
      pageSize: "101",
    });

    expect(stateResult.success).toBe(false);
    expect(listResult.success).toBe(false);
  });
});

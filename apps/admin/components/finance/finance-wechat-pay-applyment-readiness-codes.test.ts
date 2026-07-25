import { describe, expect, test } from "bun:test";
import { WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES } from "@gooes/domain";
import type { WechatPayApplymentPreflightBlocker } from "./finance-wechat-pay-applyment-shared";
import {
  type ApplymentReadinessGroup,
  presentApplymentBlocker,
} from "./finance-wechat-pay-applyment-readiness";

type Case = readonly [
  WechatPayApplymentPreflightBlocker,
  string,
  ApplymentReadinessGroup,
];

const category = "legal_representative_id_card_back";
const cases: readonly Case[] = [
  [
    { code: "APPLYMENT_SENSITIVE_PAYLOAD_MISSING" },
    "请完整核对法人、联系人和结算账户信息",
    "recognition",
  ],
  [
    { code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING", category },
    "缺少法人身份证国徽面",
    "materials",
  ],
  [
    { code: "APPLYMENT_REQUIRED_FIELD_MISSING", field: "service_phone" },
    "请填写客服电话",
    "supplement",
  ],
  [
    { code: "APPLYMENT_STATUS_NOT_SUBMITTABLE" },
    "当前申请状态暂不能向微信提交",
    "submit",
  ],
  [
    { code: "APPLYMENT_SUBMISSION_LEASE_INVALID" },
    "申请提交状态异常，请刷新后重试",
    "submit",
  ],
  [
    { code: "APPLYMENT_SUBMISSION_IN_PROGRESS" },
    "申请正在提交，请稍候刷新",
    "submit",
  ],
  [
    { code: "APPLYMENT_MEDIA_METADATA_INVALID" },
    "申请附件信息不完整，请重新上传",
    "materials",
  ],
  [
    { code: "APPLYMENT_MEDIA_CATEGORY_INVALID" },
    "申请附件类型无法识别，请重新上传",
    "materials",
  ],
  [
    { code: "APPLYMENT_MEDIA_CATEGORY_DUPLICATE", category },
    "法人身份证国徽面请仅保留一份",
    "materials",
  ],
  [
    { code: "APPLYMENT_OBJECT_KEY_INVALID", category },
    "法人身份证国徽面归属异常，请重新上传",
    "materials",
  ],
  [
    { code: "APPLYMENT_MEDIA_TYPE_UNSUPPORTED", category },
    "法人身份证国徽面格式不支持，请上传 JPG、PNG 或 BMP",
    "materials",
  ],
  [
    { code: "APPLYMENT_MEDIA_SIZE_INVALID", category },
    "法人身份证国徽面文件大小无效，请重新上传",
    "materials",
  ],
  [
    { code: "APPLYMENT_MEDIA_TOO_LARGE", category },
    "法人身份证国徽面超过 2 MB，请压缩后重新上传",
    "materials",
  ],
  [
    { code: "APPLYMENT_ENTERPRISE_ACCOUNT_TYPE_INVALID" },
    "企业主体须选择对公结算账户",
    "supplement",
  ],
  [
    { code: "APPLYMENT_SETTLEMENT_RULE_INVALID" },
    "经营行业与结算规则不匹配，请重新选择",
    "supplement",
  ],
  [
    { code: "APPLYMENT_ATTACHMENT_OCR_REVIEW_REQUIRED", category },
    "请核对法人身份证国徽面识别结果",
    "recognition",
  ],
  [
    { code: "APPLYMENT_ATTACHMENT_OCR_RECOGNITION_MISMATCH", category },
    "法人身份证国徽面识别记录与当前申请不一致，请重新识别",
    "recognition",
  ],
  [
    { code: "APPLYMENT_SENSITIVE_PAYLOAD_VERSION_MISMATCH" },
    "法人、联系人或结算账户信息已变化，请重新核对",
    "recognition",
  ],
  [
    { code: "APPLYMENT_SENSITIVE_PAYLOAD_UNREADABLE" },
    "法人、联系人或结算账户信息无法读取，请重新填写",
    "recognition",
  ],
  [
    { code: "APPLYMENT_NOT_FOUND" },
    "申请资料不存在或已失效，请刷新后重试",
    "submit",
  ],
  [
    { code: "PREFLIGHT_DATA_ACCESS_FAILED" },
    "暂时无法核验申请资料，请稍后重试",
    "submit",
  ],
  [
    { code: "PREFLIGHT_INTERNAL_ERROR" },
    "暂时无法核验申请资料，请稍后重试",
    "submit",
  ],
];

const platformCodes = WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES.filter(
  (code) =>
    code.startsWith("PLATFORM_PAYMENT_") ||
    code.startsWith("WECHAT_PAY_"),
);

describe("presentApplymentBlocker actual backend codes", () => {
  test("covers every code from the shared blocker contract", () => {
    const coveredCodes = new Set([
      ...cases.map(([blocker]) => blocker.code),
      ...platformCodes,
    ]);
    expect(coveredCodes).toEqual(
      new Set(WECHAT_PAY_APPLYMENT_KNOWN_BLOCKER_CODES),
    );
  });

  for (const [blocker, label, targetStage] of cases) {
    test(`maps ${blocker.code}`, () => {
      expect(presentApplymentBlocker(blocker)).toMatchObject({
        label,
        targetStage,
      });
    });
  }

  for (const code of platformCodes) {
    test(`maps ${code} without exposing its code`, () => {
      expect(presentApplymentBlocker({ code })).toEqual({
        label: "平台微信支付配置尚未就绪，请联系平台管理员",
        targetStage: "submit",
      });
    });
  }
});

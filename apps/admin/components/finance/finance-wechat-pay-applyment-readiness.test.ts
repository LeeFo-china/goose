import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FinanceWechatPayApplymentReview } from "./finance-wechat-pay-applyment-review";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("presentApplymentBlocker", () => {
  test("maps attachment, sensitive field, and unknown blockers explicitly", async () => {
    const { presentApplymentBlocker } = await import(
      "./finance-wechat-pay-applyment-readiness"
    );

    expect(presentApplymentBlocker({
      code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
      category: "legal_representative_id_card_back",
    })).toEqual({
      label: "缺少法人身份证国徽面",
      targetStage: "materials",
    });
    expect(presentApplymentBlocker({
      code: "APPLYMENT_REQUIRED_FIELD_MISSING",
      field: "sensitive.identity_number",
    })).toEqual({
      label: "请核对法人身份证号码",
      targetStage: "recognition",
    });
    expect(presentApplymentBlocker({
      code: "APPLYMENT_UNKNOWN_TECHNICAL_BLOCKER",
    })).toEqual({
      label: "申请资料尚未满足提交条件",
      targetStage: "submit",
    });
  });

  test("uses the approved field presentation dictionary", async () => {
    const { presentApplymentBlocker } = await import(
      "./finance-wechat-pay-applyment-readiness"
    );
    const cases = [
      ["subject_type", "请选择主体类型", "materials"],
      ["merchant_short_name", "请填写商户简称", "supplement"],
      ["license_name", "请核对营业执照主体名称", "recognition"],
      ["license_code", "请核对统一社会信用代码", "recognition"],
      ["legal_representative_name", "请核对法人姓名", "recognition"],
      ["identity_doc_type", "请确认法人证件类型", "recognition"],
      ["identity_address", "请核对法人身份证地址", "recognition"],
      ["identity_period_begin", "请核对身份证有效期开始日期", "recognition"],
      ["identity_period_end", "身份证有效期尚未确认", "recognition"],
      ["contact_type", "请选择超级管理员身份", "materials"],
      ["super_admin_name", "请核对超级管理员姓名", "recognition"],
      ["super_admin_phone_masked", "请填写超级管理员手机号", "supplement"],
      ["super_admin_email", "请填写超级管理员邮箱", "supplement"],
      ["contact_identity_doc_type", "请确认经办人证件类型", "recognition"],
      [
        "contact_identity_period_begin",
        "请核对经办人证件有效期开始日期",
        "recognition",
      ],
      [
        "contact_identity_period_end",
        "请核对经办人证件有效期结束日期",
        "recognition",
      ],
      ["service_phone", "请填写客服电话", "supplement"],
      ["settlement_account_type", "请选择结算账户类型", "supplement"],
      ["settlement_account_name", "请填写结算账户开户名", "supplement"],
      ["settlement_bank_name", "请核对开户银行", "recognition"],
      ["settlement_account_number_masked", "请核对银行账号", "recognition"],
      [
        "settlement_account_summary",
        "结算账户信息尚未完整保存",
        "recognition",
      ],
      ["settlement_id", "请选择经营行业与结算规则", "supplement"],
      ["qualification_type", "请选择经营行业与结算规则", "supplement"],
      ["business_scene_description", "请填写经营场景说明", "supplement"],
      ["contact_address", "请填写经营联系地址", "supplement"],
      ["sensitive.identity_number", "请核对法人身份证号码", "recognition"],
      ["sensitive.identity_name", "请核对法人身份证姓名", "recognition"],
      ["sensitive.contact_name", "请核对超级管理员姓名", "recognition"],
      ["sensitive.contact_phone", "请填写超级管理员手机号", "supplement"],
      ["sensitive.contact_email", "请填写超级管理员邮箱", "supplement"],
      [
        "sensitive.contact_identity_number",
        "请核对经办人身份证号码",
        "recognition",
      ],
      [
        "sensitive.contact_identity_address",
        "请核对经办人身份证地址",
        "recognition",
      ],
      [
        "sensitive.bank_account_name",
        "请填写结算账户开户名",
        "supplement",
      ],
      [
        "sensitive.bank_account_number",
        "请核对银行账号",
        "recognition",
      ],
    ] as const;

    for (const [field, label, targetStage] of cases) {
      expect(presentApplymentBlocker({
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field,
      })).toEqual({ label, targetStage });
    }
  });

  test("keeps attachment labels natural and sensitive payload guidance fixed", async () => {
    const { presentApplymentBlocker } = await import(
      "./finance-wechat-pay-applyment-readiness"
    );

    expect(presentApplymentBlocker({
      code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
      category: "license_copy",
    })).toEqual({
      label: "缺少营业执照",
      targetStage: "materials",
    });
    expect(presentApplymentBlocker({
      code: "APPLYMENT_SENSITIVE_PAYLOAD_MISSING",
    })).toEqual({
      label: "请完整核对法人、联系人和结算账户信息",
      targetStage: "recognition",
    });
    expect(presentApplymentBlocker({
      code: "APPLYMENT_REQUIRED_ATTACHMENT_MISSING",
      category: "future_attachment",
    })).toEqual({
      label: "缺少申请附件",
      targetStage: "materials",
    });
  });
});

describe("presentApplymentBlockers", () => {
  test("keeps every blocker visible with deterministic unique keys", async () => {
    const { presentApplymentBlockers } = await import(
      "./finance-wechat-pay-applyment-readiness"
    );
    const blockers = [
      {
        code: "APPLYMENT_REQUIRED_FIELD_MISSING",
        field: "merchant_short_name",
      },
      { code: "APPLYMENT_FUTURE_BLOCKER" },
      { code: "APPLYMENT_FUTURE_BLOCKER" },
    ];

    expect(presentApplymentBlockers(blockers)).toEqual([
      {
        key: "APPLYMENT_REQUIRED_FIELD_MISSING:merchant_short_name",
        label: "请填写商户简称",
        targetStage: "supplement",
      },
      {
        key: "APPLYMENT_FUTURE_BLOCKER:unknown",
        label: "申请资料尚未满足提交条件",
        targetStage: "submit",
      },
      {
        key: "APPLYMENT_FUTURE_BLOCKER:unknown:2",
        label: "申请资料尚未满足提交条件",
        targetStage: "submit",
      },
    ]);
  });
});

describe("FinanceWechatPayApplymentReview readiness", () => {
  test("renders all blockers as focused navigation actions", () => {
    const markup = renderToStaticMarkup(createElement(
      FinanceWechatPayApplymentReview,
      {
        review: {
          subject: "主体资料",
          contact: "联系人资料",
          settlement: "结算资料",
          attachments: "申请附件",
        },
        attachments: [],
        contactType: "LEGAL",
        confirmed: false,
        disabled: false,
        navigationDisabled: false,
        readinessBlockers: [
          {
            key: "missing-back",
            label: "缺少法人身份证国徽面",
            targetStage: "materials",
          },
          {
            key: "unknown",
            label: "申请资料尚未满足提交条件",
            targetStage: "submit",
          },
        ],
        onConfirmedChange: () => undefined,
        onNavigate: () => undefined,
        onStageChange: () => undefined,
      },
    ));

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("还有 2 项需要处理");
    expect(markup).toContain("缺少法人身份证国徽面");
    expect(markup).toContain("申请资料尚未满足提交条件");
    expect(markup).not.toContain("APPLYMENT_");
    expect(markup.match(/data-readiness-blocker/g)).toHaveLength(2);
  });

  test("keeps refreshed readiness wired through the workflow", () => {
    const panelSource = readSource(
      "./finance-wechat-pay-applyment-panel.tsx",
    );
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    const reviewSource = readSource(
      "./finance-wechat-pay-applyment-review.tsx",
    );

    expect(workflowSource).toContain("presentApplymentBlockers");
    expect(panelSource).toContain(
      "submissionReadiness={autosave.currentDetail.submission_readiness}",
    );
    expect(panelSource).toContain(
      "blockerStages: getApplymentBlockerStages",
    );
    expect(workflowSource).toContain(
      "readinessBlockers={readinessBlockers}",
    );
    expect(reviewSource).toContain("@/components/ui/alert");
    expect(reviewSource).toContain("CircleAlert");
    expect(reviewSource).toContain("ChevronRight");
    expect(reviewSource).toContain(
      "onStageChange(blocker.targetStage)",
    );
  });
});

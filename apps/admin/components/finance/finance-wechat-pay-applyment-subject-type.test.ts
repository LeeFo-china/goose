import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  buildWechatPayApplymentSubjectTypeOverrides,
} from "./finance-wechat-pay-applyment-subject-type";
import type {
  WechatPaySettlementRuleRecord,
} from "./finance-wechat-pay-applyment-shared";

const settlementRules: WechatPaySettlementRuleRecord[] = [
  {
    id: "00000000-0000-4000-8000-000000000716",
    subject_type: "SUBJECT_TYPE_ENTERPRISE",
    settlement_id: "716",
    qualification_type: "零售",
    label: "零售",
    rate_label: "0.6%",
    settlement_cycle_label: "T+1",
    requires_special_qualification: false,
    status: "active",
    sort_order: 10,
  },
  {
    id: "00000000-0000-4000-8000-000000000719",
    subject_type: "SUBJECT_TYPE_INDIVIDUAL",
    settlement_id: "719",
    qualification_type: "零售",
    label: "零售",
    rate_label: "0.6%",
    settlement_cycle_label: "T+1",
    requires_special_qualification: false,
    status: "active",
    sort_order: 20,
  },
];

describe("wechat pay applyment subject type overrides", () => {
  test("switches an enterprise draft to consistent individual settlement defaults", () => {
    expect(
      buildWechatPayApplymentSubjectTypeOverrides(
        "SUBJECT_TYPE_INDIVIDUAL",
        settlementRules,
      ),
    ).toEqual({
      subject_type: "SUBJECT_TYPE_INDIVIDUAL",
      settlement_account_type: "BANK_ACCOUNT_TYPE_PERSONAL",
      settlement_id: "719",
      qualification_type: "零售",
    });
  });

  test("switches an individual draft to consistent enterprise settlement defaults", () => {
    expect(
      buildWechatPayApplymentSubjectTypeOverrides(
        "SUBJECT_TYPE_ENTERPRISE",
        settlementRules,
      ),
    ).toEqual({
      subject_type: "SUBJECT_TYPE_ENTERPRISE",
      settlement_account_type: "BANK_ACCOUNT_TYPE_CORPORATE",
      settlement_id: "716",
      qualification_type: "零售",
    });
  });

  test("schedules the complete subject settlement overrides after updating state", () => {
    const panelSource = readFileSync(
      new URL("./finance-wechat-pay-applyment-panel.tsx", import.meta.url),
      "utf8",
    );
    const start = panelSource.indexOf(
      "function handleSubjectTypeChange(value: string)",
    );
    const end = panelSource.indexOf(
      "\n  function handleManualFieldChange",
      start,
    );
    const handlerSource = panelSource.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(handlerSource).toContain(
      "buildWechatPayApplymentSubjectTypeOverrides(\n        value,\n        settlementRules,\n      )",
    );
    expect(handlerSource.indexOf("setSubjectType(value)")).toBeLessThan(
      handlerSource.indexOf("scheduleDraftSave(overrides)"),
    );
    expect(handlerSource).not.toContain(
      "scheduleDraftSave({ subject_type: value })",
    );
  });
});

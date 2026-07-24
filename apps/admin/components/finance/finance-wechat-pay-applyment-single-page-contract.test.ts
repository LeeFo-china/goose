import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  APPLYMENT_TARGET_IDS,
  focusApplymentReadinessTarget,
} from "./finance-wechat-pay-applyment-readiness";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function getComponentInvocation(source: string, componentName: string) {
  return source.match(
    new RegExp(`<${componentName}\\b[\\s\\S]*?\\/>`),
  )?.[0] ?? "";
}

function getComponentInvocations(source: string, componentName: string) {
  return source.match(
    new RegExp(`<${componentName}\\b[\\s\\S]*?\\/>`, "g"),
  ) ?? [];
}

describe("wechat pay applyment single-page contracts", () => {
  test("splits supplement fields with exact active props", () => {
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    const panelSource = readSource(
      "./finance-wechat-pay-applyment-panel.tsx",
    );
    const reviewSource = readSource(
      "./finance-wechat-pay-applyment-review.tsx",
    );

    for (const component of [
      "FinanceWechatPayApplymentContactFields",
      "FinanceWechatPayApplymentSettlementFields",
      "FinanceWechatPayApplymentBusinessFields",
    ]) {
      expect(supplementSource).toContain(`export function ${component}`);
      expect(supplementSource).toContain(`<${component}`);
    }
    const businessFieldsSource = supplementSource.slice(
      supplementSource.indexOf(
        "export function FinanceWechatPayApplymentBusinessFields",
      ),
      supplementSource.indexOf(
        "export function FinanceWechatPayApplymentSupplementFields",
      ),
    );
    expect(businessFieldsSource).not.toContain("onDataChange");
    const commonFieldsPropsSource = supplementSource.slice(
      supplementSource.indexOf("type CommonFieldsProps"),
      supplementSource.indexOf("type DataChangeProps"),
    );
    expect(commonFieldsPropsSource).not.toContain("onContactTypeChange");
    expect(commonFieldsPropsSource).not.toContain("onDataChange");
    for (const deprecatedProp of [
      "contactType",
      "navigationDisabled",
      "onReturnToMaterials",
    ]) {
      expect(supplementSource).not.toContain(deprecatedProp);
    }
    expect(reviewSource).not.toContain("<Props extends ReviewProps>");
    const workflowSupplement = getComponentInvocation(
      workflowSource,
      "FinanceWechatPayApplymentSupplementFields",
    );
    const workflowReview = getComponentInvocation(
      workflowSource,
      "FinanceWechatPayApplymentReview",
    );
    for (const deprecatedProp of [
      "contactType",
      "navigationDisabled",
      "onReturnToMaterials",
    ]) {
      expect(workflowSupplement).not.toContain(deprecatedProp);
    }
    for (const deprecatedProp of [
      "review",
      "onNavigate",
      "onStageChange",
      "navigationDisabled",
    ]) {
      expect(workflowReview).not.toContain(`${deprecatedProp}=`);
    }
    for (const deprecatedName of [
      "reviewSnapshot",
      "onReviewNavigation",
    ]) {
      expect(workflowSource).not.toContain(deprecatedName);
      expect(panelSource).not.toContain(deprecatedName);
    }
    for (const deprecatedPanelName of [
      "reviewRevision",
      "handleReviewNavigation",
      "buildCurrentSubmission",
    ]) {
      expect(panelSource).not.toContain(deprecatedPanelName);
    }
    expect(panelSource).toContain("function buildCurrentDraftPayload");
    expect(panelSource).toContain("buildPayload: () => buildCurrentDraftPayload()");
  });

  test("uses one linked settlement rule select", () => {
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const ruleFieldSource = readSource(
      "./finance-wechat-pay-settlement-rule-field.tsx",
    );

    expect(supplementSource).toContain("FinanceWechatPaySettlementRuleField");
    expect(supplementSource).not.toContain('<TextField label="结算规则 ID"');
    expect(supplementSource).not.toContain('<TextField label="所属行业"');
    expect(ruleFieldSource).toContain("getWechatPaySettlementRulesForSubject");
    expect(ruleFieldSource).toContain("@/components/ui/select");
    expect(ruleFieldSource).toContain('name="settlement_id"');
    expect(ruleFieldSource).toContain('name="qualification_type"');
    expect(ruleFieldSource).toContain("经营行业与结算规则");
  });

  test("scrolls then focuses an existing readiness target", () => {
    const calls: Array<[string, unknown]> = [];
    const result = focusApplymentReadinessTarget(
      APPLYMENT_TARGET_IDS.settlementMaterials,
      {
        getElementById: () => ({
          scrollIntoView: (options) => calls.push(["scroll", options]),
          focus: (options) => calls.push(["focus", options]),
        }),
        prefersReducedMotion: () => false,
      },
    );

    expect(result).toBe(true);
    expect(calls).toEqual([
      ["scroll", { behavior: "smooth", block: "center" }],
      ["focus", { preventScroll: true }],
    ]);
  });

  test("returns false when the readiness target does not exist", () => {
    expect(
      focusApplymentReadinessTarget(
        APPLYMENT_TARGET_IDS.businessMaterials,
        {
          getElementById: () => null,
          prefersReducedMotion: () => false,
        },
      ),
    ).toBe(false);
  });

  test("uses auto scrolling when reduced motion is preferred", () => {
    const calls: Array<[string, unknown]> = [];
    focusApplymentReadinessTarget(APPLYMENT_TARGET_IDS.businessMaterials, {
      getElementById: () => ({
        scrollIntoView: (options) => calls.push(["scroll", options]),
        focus: (options) => calls.push(["focus", options]),
      }),
      prefersReducedMotion: () => true,
    });

    expect(calls[0]).toEqual([
      "scroll",
      { behavior: "auto", block: "center" },
    ]);
  });

  test("shares target constants with accessible nested material sections", () => {
    expect(APPLYMENT_TARGET_IDS).toMatchObject({
      settlementMaterials: "settlement-materials",
      businessMaterials: "business-materials",
    });

    const documentSectionSource = readSource(
      "./finance-wechat-pay-applyment-document-section.tsx",
    );
    const attachmentSource = readSource(
      "./finance-wechat-pay-applyment-attachments.tsx",
    );
    expect(documentSectionSource).toContain("id?: ApplymentTargetId");
    expect(documentSectionSource).toContain("tabIndex={-1}");
    expect(documentSectionSource).toContain('headingLevel?: "h2" | "h3"');

    const singlePageUrl = new URL(
      "./finance-wechat-pay-applyment-single-page.tsx",
      import.meta.url,
    );
    expect(existsSync(singlePageUrl)).toBe(true);
    if (!existsSync(singlePageUrl)) return;
    const singlePageSource = readFileSync(singlePageUrl, "utf8");
    const settlementMaterials = getComponentInvocations(
      singlePageSource,
      "FinanceWechatPayApplymentDocumentSection",
    ).find((invocation) =>
      invocation.includes("SETTLEMENT_DOCUMENT_SECTION_CONFIG")
    ) ?? "";
    const businessMaterials = getComponentInvocation(
      singlePageSource,
      "WechatPayApplymentBusinessMaterials",
    );
    expect(settlementMaterials).toContain(
      "id={APPLYMENT_TARGET_IDS.settlementMaterials}",
    );
    expect(settlementMaterials).toContain('headingLevel="h3"');
    expect(businessMaterials).toContain(
      "id={APPLYMENT_TARGET_IDS.businessMaterials}",
    );
    expect(attachmentSource).toContain("aria-labelledby={headingId}");
    expect(attachmentSource).toContain("<h3");
  });

  test("keeps the page layout contract below the focused-test size limit", () => {
    const pageLayoutSource = readSource(
      "./finance-wechat-pay-applyment-page-layout.test.ts",
    );

    expect(pageLayoutSource.split("\n").length).toBeLessThan(450);
  });
});

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function expectComponentProp(
  source: string,
  component: string,
  prop: string,
  value: string,
) {
  const tags = source.match(
    new RegExp(`<${component}\\b[\\s\\S]*?\\/>`, "g"),
  ) ?? [];
  expect(
    tags.some((tag) => tag.includes(`${prop}={${value}}`)),
    `${component}.${prop} 应精确接收 ${value}`,
  ).toBe(true);
}

function getComponentInvocations(source: string, component: string) {
  return source.match(
    new RegExp(`<${component}\\b[\\s\\S]*?\\/>`, "g"),
  ) ?? [];
}

function getObjectDeclaration(source: string, declaration: string) {
  const start = source.indexOf(declaration);
  const end = source.indexOf("\n  };", start);
  expect(start, `${declaration} 应存在`).toBeGreaterThanOrEqual(0);
  expect(end, `${declaration} 应完整结束`).toBeGreaterThan(start);
  return source.slice(start, end + 5);
}

describe("Finance wechat pay applyment save layout", () => {
  test("wires create update submit and attachment upload contracts", () => {
    const requestSource = readSource("./finance-wechat-pay-applyment-requests.ts");
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const singlePageSource = readSource(
      "./finance-wechat-pay-applyment-single-page.tsx",
    );
    const fieldSource = readSource("./finance-wechat-pay-applyment-form-fields.tsx");
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");
    const controllerSource = readSource(
      "./finance-wechat-pay-applyment-attachment-controller.ts",
    );

    expect(requestSource).toContain("/finance/wechat-pay/applyment/current");
    expect(panelSource).toContain("/finance/wechat-pay/applyments");
    expect(panelSource).toContain("/submit");
    expect(singlePageSource).toContain(
      "useWechatPayApplymentAttachmentController",
    );
    expect(controllerSource).toContain("uploadDirectToCos");
    expect(controllerSource).toContain("wechat_pay_applyment");
    expect(attachmentSource).not.toContain("uploadDirectToCos");
    expect(singlePageSource).toContain("license_copy");
    expect(singlePageSource).toContain(
      "LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG",
    );
    expect(`${panelSource}\n${singlePageSource}`).toContain("attachments");
    expect(fieldSource).toContain("@/components/ui/select");
    expect(fieldSource).toContain("SelectGroup");
  });

  test("forwards exact handlers from Panel through Workflow into SinglePage", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    const panelHandlers = [
      ["onSubjectTypeChange", "handleSubjectTypeChange"],
      ["onContactTypeChange", "changeContactType"],
      ["onAttachmentsChange", "handleAttachmentsChange"],
      ["onApplyRecognition", "applyRecognitionRows"],
      ["onManualFieldChange", "handleManualFieldChange"],
      ["onSupplementDataChange", "handleSupplementDataChange"],
      ["onReviewConfirmedChange", "setReviewConfirmed"],
      ["onSubmitApplyment", "submitApplyment"],
    ] as const;

    for (const [prop, handler] of panelHandlers) {
      expectComponentProp(
        panelSource,
        "FinanceWechatPayApplymentWorkflow",
        prop,
        handler,
      );
    }
    for (const [prop] of panelHandlers) {
      expectComponentProp(
        workflowSource,
        "FinanceWechatPayApplymentSinglePage",
        prop,
        prop,
      );
    }
  });

  test("connects SinglePage callbacks through runtime consumers", () => {
    const singlePageUrl = new URL(
      "./finance-wechat-pay-applyment-single-page.tsx",
      import.meta.url,
    );
    const documentSectionSource = readSource(
      "./finance-wechat-pay-applyment-document-section.tsx",
    );
    expect(existsSync(singlePageUrl)).toBe(true);
    if (!existsSync(singlePageUrl)) return;
    const singlePageSource = readFileSync(singlePageUrl, "utf8");

    const attachmentController = getObjectDeclaration(
      singlePageSource,
      "const attachmentController = useWechatPayApplymentAttachmentController({",
    );
    expect(attachmentController).toContain(
      "onChange: onAttachmentsChange",
    );

    const ocrController = getObjectDeclaration(
      singlePageSource,
      "const ocrController = {",
    );
    expect(ocrController).toContain("onApply: onApplyRecognition");
    expect(ocrController).toContain(
      "onManualChange: onManualFieldChange",
    );

    const documentSections = getComponentInvocations(
      singlePageSource,
      "FinanceWechatPayApplymentDocumentSection",
    );
    expect(documentSections.length).toBeGreaterThan(0);
    for (const invocation of documentSections) {
      expect(invocation).toContain("attachmentController={attachmentController}");
      expect(invocation).toContain("ocrController={ocrController}");
      for (const pseudoProp of [
        "onSubjectTypeChange",
        "onAttachmentsChange",
        "onApplyRecognition",
        "onManualFieldChange",
      ]) {
        expect(invocation).not.toContain(`${pseudoProp}=`);
      }
    }
    expect(documentSectionSource).toContain("{...ocrController}");

    const selectFields = getComponentInvocations(singlePageSource, "SelectField");
    expect(
      selectFields.find((invocation) =>
        invocation.includes('name="subject_type"')
      ),
    ).toContain("onValueChange={onSubjectTypeChange}");
    expect(
      selectFields.find((invocation) =>
        invocation.includes('name="contact_type"')
      ),
    ).toContain("onValueChange={onContactTypeChange}");

    expectComponentProp(
      singlePageSource,
      "FinanceWechatPayApplymentSettlementFields",
      "onDataChange",
      "onSupplementDataChange",
    );
    expectComponentProp(
      singlePageSource,
      "FinanceWechatPayApplymentReview",
      "onConfirmedChange",
      "onReviewConfirmedChange",
    );
    expectComponentProp(
      singlePageSource,
      "FinanceWechatPayApplymentActions",
      "onSubmitApplyment",
      "onSubmitApplyment",
    );

    const contactFields = getComponentInvocations(
      singlePageSource,
      "FinanceWechatPayApplymentContactFields",
    );
    const businessFields = getComponentInvocations(
      singlePageSource,
      "FinanceWechatPayApplymentBusinessFields",
    );
    expect(contactFields).toHaveLength(1);
    expect(contactFields[0]).not.toContain("onContactTypeChange=");
    expect(businessFields).toHaveLength(1);
    expect(businessFields[0]).not.toContain("onDataChange=");
  });

  test("keeps the complete draft payload aligned with the form fields", () => {
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const schemaSource = readSource("./finance-wechat-pay-applyment-schema.ts");
    const formContractSource = `${supplementSource}\n${schemaSource}`;

    for (const field of [
      "merchant_short_name",
      "super_admin_phone",
      "settlement_account_type",
      "settlement_account_number",
      "settlement_bank_full_name",
      "settlement_bank_branch_id",
    ]) {
      expect(formContractSource).toContain(field);
    }
    expect(supplementSource).toContain("settlement_account_type: value");
    expect(supplementSource).toContain("onDataChange(overrides)");
    expect(supplementSource).toContain('requirement="required"');
    expect(supplementSource).toContain('requirement="optional"');
    expect(formContractSource).not.toContain(
      "settlement_account_summary: requiredText",
    );
    expect(formContractSource).not.toContain("api_v3_key");
  });

  test("keeps sensitive fields and OCR-backed attachment categories in the draft contract", () => {
    const schemaSource = readSource("./finance-wechat-pay-applyment-schema.ts");
    const attachmentSource = readSource(
      "./finance-wechat-pay-applyment-attachments.tsx",
    );
    const singlePageSource = readSource(
      "./finance-wechat-pay-applyment-single-page.tsx",
    );
    const documentSectionSource = readSource(
      "./finance-wechat-pay-applyment-document-section.tsx",
    );
    const recognizedFieldsSource = readSource(
      "./finance-wechat-pay-applyment-recognized-fields.tsx",
    );
    const sensitiveContract =
      `${schemaSource}\n${attachmentSource}\n${singlePageSource}\n${documentSectionSource}\n${recognizedFieldsSource}`;

    expect(sensitiveContract).toContain("identity_number");
    expect(sensitiveContract).toContain("contact_identity_number");
    expect(sensitiveContract).toContain("settlement_account_number");
    expect(schemaSource).toContain("delete payload.contact_identity_number");
    expect(singlePageSource).toContain("license_copy");
    expect(documentSectionSource).toContain(
      "legal_representative_id_card_front",
    );
    expect(documentSectionSource).toContain(
      "legal_representative_id_card_back",
    );
  });

  test("flushes the current draft before submit", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const coordinatorSource = readSource(
      "./finance-wechat-pay-applyment-autosave-coordinator.ts",
    );

    expect(panelSource).toContain("formRef");
    expect(panelSource).toContain("submitApplymentAfterDraftFlush");
    expect(coordinatorSource).toContain('draft_update_source: "manual_save"');
    expect(coordinatorSource).toContain("await input.flush()");
    expect(coordinatorSource).toContain("idempotency_key: target.id");
  });

  test("uses one lifecycle-safe autosave coordinator and compact status UI", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const queueSource = readSource(
      "./finance-wechat-pay-applyment-autosave.ts",
    );
    const coordinatorSource = readSource(
      "./finance-wechat-pay-applyment-autosave-coordinator.ts",
    );
    const hookSource = readSource("./use-wechat-pay-applyment-autosave.ts");
    const statusSource = readSource(
      "./finance-wechat-pay-applyment-save-status.tsx",
    );

    expect(panelSource.split("\n").length).toBeLessThan(430);
    expect(panelSource).toContain("useWechatPayApplymentAutosave");
    expect(panelSource).toContain("onInputCapture");
    expect(panelSource).toContain("scheduleDraftSave");
    expect(panelSource).toContain("enqueueMaterialCheckpoint");
    expect(panelSource).toContain("FinanceWechatPayApplymentPanelStatus");
    expect(queueSource).toContain("reset()");
    expect(queueSource).toContain("dispose()");
    expect(queueSource).toContain("generation");
    expect(coordinatorSource).toContain("800");
    expect(coordinatorSource).toContain("WECHAT_PAY_APPLYMENT_EXISTS");
    expect(coordinatorSource).toContain(
      "/finance/wechat-pay/applyment/current",
    );
    expect(hookSource).toContain("retryLastSave");
    expect(hookSource).toContain("coordinator.retry");
    expect(hookSource).toContain("isLatestPayload(payload)");
    expect(hookSource).toContain("ensureAutosaveRuntime");
    expect(hookSource).toContain("runtimeRef.current = null");
    expect(statusSource).toContain("@/components/ui/alert");
    expect(statusSource).toContain("@/components/ui/button");
    expect(statusSource).toContain("@/components/ui/spinner");
    expect(statusSource).toContain("保存中");
    expect(statusSource).toContain("已自动保存");
    expect(statusSource).toContain("保存失败");
    expect(statusSource).toContain("重试保存");
  });

  test("uses live save capabilities and explicit controlled field overrides", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const hookSource = readSource("./use-wechat-pay-applyment-autosave.ts");
    const schemaSource = readSource("./finance-wechat-pay-applyment-schema.ts");

    expect(hookSource).toContain("currentDetailRef");
    expect(hookSource).toContain("commitDetail");
    expect(panelSource).toContain("const editable = autosave.canEdit");
    expect(panelSource).toContain("const canSubmit = autosave.canSubmit");
    expect(panelSource).not.toContain("const editable = data.can_edit");
    expect(panelSource).not.toContain("canSubmit={data.can_submit}");
    expect(panelSource).toContain(
      "buildWechatPayApplymentManualFieldOverride(key, value)",
    );
    expect(schemaSource).toContain("CONTACT_IDENTITY_PERIOD_FIELDS");
    expect(schemaSource).toContain("normalized || null");
  });

  test("isolates stale detail publication and flushes safely on detach", () => {
    const coordinatorSource = readSource(
      "./finance-wechat-pay-applyment-autosave-coordinator.ts",
    );
    const hookSource = readSource("./use-wechat-pay-applyment-autosave.ts");
    const lifecycleSource = readSource(
      "./finance-wechat-pay-applyment-lifecycle.ts",
    );
    const statusSource = readSource(
      "./finance-wechat-pay-applyment-save-status.tsx",
    );

    expect(coordinatorSource).toContain("shouldCommitDetail");
    expect(coordinatorSource).toContain("keepalive");
    expect(coordinatorSource).toContain("detach()");
    expect(hookSource).toContain("mountedRef");
    expect(hookSource).toContain("markDraftSaveScheduled");
    expect(hookSource).toContain("coordinator.detach()");
    expect(hookSource).toContain("pagehide");
    expect(hookSource).toContain("pageshow");
    expect(lifecycleSource).toContain("event.persisted");
    expect(hookSource).not.toContain("runtime?.coordinator.dispose()");
    expect(statusSource).toContain('<Spinner aria-hidden="true" />');
  });
});

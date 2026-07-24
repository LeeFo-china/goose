import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { tenantNavGroups } from "@/components/layout/menu-config";
import { FINANCE_MODULE_TABS } from "./finance-module-tabs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const SINGLE_PAGE_INTERACTION_CALLBACKS = [
  "onAttachmentsChange", "onApplyRecognition",
  "onManualFieldChange", "onReviewConfirmedChange",
  "onSubmitApplyment", "onSubjectTypeChange",
  "onContactTypeChange", "onSupplementDataChange",
] as const;

function expectForwardedCallback(source: string, callback: string) {
  expect(source).toMatch(new RegExp(
    `${callback}=\\{(?:props\\.)?${callback}\\}`,
  ));
}

function expectUsedCallback(source: string, callback: string) {
  expect(source).toMatch(new RegExp(`=\\{(?:props\\.)?${callback}\\}`));
}

describe("Finance wechat pay applyment page layout", () => {
  test("exposes tenant sidebar and finance tab entry for applyment flow", () => {
    const financeGroup = tenantNavGroups.find((group) => group.label === "财务");

    expect(financeGroup?.items).toContainEqual(
      expect.objectContaining({
        href: "/finance/wechat-pay/applyment",
        label: "支付开通",
        permission: "wechat_pay.applyment.read",
      }),
    );
    expect(FINANCE_MODULE_TABS).toContainEqual({
      value: "wechat-pay-applyment",
      label: "支付开通",
      href: "/finance/wechat-pay/applyment",
    });
  });

  test("adds tenant applyment page wired to requests and form component", () => {
    const pageUrl = new URL(
      "../../app/(console)/finance/wechat-pay/applyment/page.tsx",
      import.meta.url,
    );

    expect(existsSync(pageUrl)).toBe(true);
    const pageSource = readFileSync(pageUrl, "utf8");
    expect(pageSource).toContain('activeTab="wechat-pay-applyment"');
    expect(pageSource).toContain("fetchWechatPayApplymentCurrent");
    expect(pageSource).toContain("FinanceWechatPayApplymentPanel");
    expect(pageSource).toContain("/finance/wechat-pay");
  });

  test("tenant applyment form marks required optional and attachment requirements", () => {
    const fieldSource = readSource("./finance-wechat-pay-applyment-form-fields.tsx");
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");

    expect(fieldSource).toContain("RequirementBadge");
    expect(fieldSource).toContain("必填");
    expect(fieldSource).toContain("选填");
    expect(fieldSource).toContain("required={required}");
    expect(fieldSource).toContain("aria-required");
    expect(supplementSource).toContain("用于微信支付开户联系");
    expect(supplementSource).toContain('name="super_admin_phone"');
    expect(supplementSource).toContain('name="service_phone"');
    expect(attachmentSource).toContain("必传");
    expect(attachmentSource).toContain("选传");
  });

  test("uses one linked settlement rule select instead of technical text inputs", () => {
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const ruleFieldUrl = new URL(
      "./finance-wechat-pay-settlement-rule-field.tsx",
      import.meta.url,
    );

    expect(existsSync(ruleFieldUrl)).toBe(true);
    expect(supplementSource).toContain("FinanceWechatPaySettlementRuleField");
    expect(supplementSource).not.toContain('<TextField label="结算规则 ID"');
    expect(supplementSource).not.toContain('<TextField label="所属行业"');
    if (!existsSync(ruleFieldUrl)) return;

    const ruleFieldSource = readFileSync(ruleFieldUrl, "utf8");
    expect(ruleFieldSource).toContain("getWechatPaySettlementRulesForSubject");
    expect(ruleFieldSource).toContain("@/components/ui/select");
    expect(ruleFieldSource).toContain('name="settlement_id"');
    expect(ruleFieldSource).toContain('name="qualification_type"');
    expect(ruleFieldSource).toContain("经营行业与结算规则");
    expect(ruleFieldSource).toContain("rateLabel");
    expect(ruleFieldSource).toContain("settlementCycleLabel");
    expect(ruleFieldSource).toContain("qualificationType");
  });

  test("tenant applyment attachment uploader uses shadcn button for the visible upload action", () => {
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");
    const uploadButtonSource = readSource(
      "./finance-wechat-pay-applyment-upload-button.tsx",
    );
    const uploadContract = `${attachmentSource}\n${uploadButtonSource}`;

    expect(attachmentSource).toContain("ApplymentAttachmentUploadButton");
    expect(uploadButtonSource).toContain("<Button");
    expect(attachmentSource).toContain("openAttachmentPicker");
    expect(uploadButtonSource).toContain("tabIndex={-1}");
    expect(uploadButtonSource).toContain('aria-hidden="true"');
    expect(uploadContract).not.toContain("inline-flex h-9 cursor-pointer");
    expect(uploadContract).not.toContain("<label");
  });

  test("wires the materials-first upload preview auto OCR and recovery contract", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const sharedSource = readSource("./finance-wechat-pay-applyment-shared.ts");
    const attachmentSource = readSource(
      "./finance-wechat-pay-applyment-attachments.tsx",
    );
    const previewSource = readSource(
      "./finance-wechat-pay-applyment-attachment-preview.tsx",
    );
    const materialsHookSource = readSource(
      "./use-wechat-pay-applyment-materials.ts",
    );
    const materialsStageSource = readSource(
      "./finance-wechat-pay-applyment-materials-stage.tsx",
    );
    const materialRecoverySource = readSource(
      "./finance-wechat-pay-applyment-material-recovery.ts",
    );
    const materialLifecycleSource = readSource(
      "./finance-wechat-pay-applyment-lifecycle.ts",
    );
    const recognitionSource = readSource(
      "./finance-wechat-pay-applyment-recognition.ts",
    );
    const manualEntrySource = readSource(
      "./finance-wechat-pay-applyment-manual-entry.ts",
    );
    const retrySource = readSource(
      "./finance-wechat-pay-applyment-material-retry.ts",
    );
    const ocrRequestSource = readSource("../ocr/ocr-requests.ts");
    const autosaveHookSource = readSource(
      "./use-wechat-pay-applyment-autosave.ts",
    );
    const autosaveQueueSource = readSource(
      "./finance-wechat-pay-applyment-autosave.ts",
    );

    expect(panelSource).toContain("useWechatPayApplymentMaterials");
    expect(sharedSource).toContain("can_edit: boolean");
    expect(panelSource).toContain("const editable = autosave.canEdit");
    expect(panelSource).not.toContain("const editable = !applyment");
    expect(materialsHookSource).toContain("buildInitialMaterialStates");
    expect(materialsHookSource).toContain("attachmentsRef");
    expect(materialsHookSource).toContain("restoreApplymentMaterialStates");
    expect(materialsHookSource).toContain("setupMountedRefLifecycle");
    expect(materialLifecycleSource).toContain("mountedRef.current = true");
    expect(materialRecoverySource).toContain(
      "fetchApplymentOcrRecognition",
    );
    expect(materialsHookSource).toContain('draftUpdateSource: "attachment_change"');
    expect(recognitionSource).toContain('draftUpdateSource: "ocr_review"');
    expect(manualEntrySource).toContain('draftUpdateSource: "manual_entry"');
    expect(materialsStageSource).toContain("@/components/ui/checkbox");
    expect(materialsStageSource).toContain(
      "同意使用已上传证照进行信息识别和申请资料回填",
    );
    expect(materialsStageSource).toContain("证照识别暂不可用");
    expect(attachmentSource).toContain("onUploaded");
    expect(attachmentSource).toContain("onRetryRecognition");
    expect(attachmentSource).toContain("onRetrySave");
    expect(attachmentSource).toContain("attachmentSaveErrors");
    expect(attachmentSource).toContain("AttachmentCheckpointStatus");
    expect(attachmentSource).toContain("materialStates");
    expect(attachmentSource).toContain("AttachmentPreviewCard");
    expect(previewSource).toContain("AttachmentPreviewDialog");
    expect(previewSource).toContain("aspect-[4/3]");
    expect(previewSource).toContain("object-contain");
    expect(previewSource).not.toContain("attachment.object_key");
    expect(materialsHookSource).toContain(
      "rebaseUploadedApplymentAttachment",
    );
    expect(materialsHookSource).not.toContain("uploaded.nextAttachments");
    expect(retrySource).toContain("getMaterialRetryAction");
    expect(materialsHookSource).toContain("checkpointApplymentAttachment");
    expect(materialsHookSource).toContain("recognizeApplymentAttachment");
    expect(materialsHookSource).toContain("createMaterialOperationGeneration");
    expect(materialsHookSource).toContain("generationRef.current.advance()");
    expect(`${autosaveHookSource}\n${autosaveQueueSource}`).toContain(
      "context.isCurrent",
    );
    expect(attachmentSource).not.toContain("识别并回填");
    expect(attachmentSource).not.toContain("onRecognize");
    expect(ocrRequestSource).toContain("fetchApplymentOcrRecognition");
    expect(ocrRequestSource).toContain("/ocr/recognitions/${encodeURIComponent(id)}");
  });

  test("reviews OCR results inline within each document section", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const documentSectionUrl = new URL(
      "./finance-wechat-pay-applyment-document-section.tsx",
      import.meta.url,
    );
    const reviewUrl = new URL(
      "./finance-wechat-pay-applyment-ocr-review.tsx",
      import.meta.url,
    );
    const recognizedFieldsUrl = new URL(
      "./finance-wechat-pay-applyment-recognized-fields.tsx",
      import.meta.url,
    );
    expect(existsSync(documentSectionUrl)).toBe(true);
    expect(existsSync(reviewUrl)).toBe(true);
    expect(existsSync(recognizedFieldsUrl)).toBe(true);
    expect(panelSource).not.toContain("OcrFieldReviewDialog");
    expect(panelSource).not.toContain("setOcrDialogOpen");
    if (
      !existsSync(documentSectionUrl) ||
      !existsSync(reviewUrl) ||
      !existsSync(recognizedFieldsUrl)
    ) return;
    const documentSectionSource = readFileSync(documentSectionUrl, "utf8");
    const reviewSource = readFileSync(reviewUrl, "utf8");
    const recognizedFieldsSource = readFileSync(recognizedFieldsUrl, "utf8");
    expect(documentSectionSource).toContain(
      "FinanceWechatPayApplymentInlineOcrReview",
    );
    expect(reviewSource).toContain("FinanceWechatPayApplymentInlineOcrReview");
    expect(reviewSource).toContain("OcrFieldReviewRows");
    expect(reviewSource).toContain("改为手动填写");
    expect(reviewSource).toContain("onUseManualEntry");
    expect(recognizedFieldsSource).not.toContain(
      "hidden={selectedCategory !== category}",
    );
    expect(recognizedFieldsSource).toContain("onManualChange");
  });

  test("renders the applyment workflow as one continuous single page", () => {
    const singlePageUrl = new URL(
      "./finance-wechat-pay-applyment-single-page.tsx",
      import.meta.url,
    );
    expect(existsSync(singlePageUrl)).toBe(true);
    if (!existsSync(singlePageUrl)) return;
    const singlePageSource = readFileSync(singlePageUrl, "utf8");
    const documentSectionSource = readSource(
      "./finance-wechat-pay-applyment-document-section.tsx",
    );
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    expect(singlePageSource).toContain("营业执照");
    expect(singlePageSource).toContain("法人身份证");
    expect(singlePageSource).toContain("联系信息");
    expect(singlePageSource).toContain("结算账户");
    expect(singlePageSource).toContain("经营资料");
    expect(singlePageSource).toContain("提交平台审核");
    expect(singlePageSource).not.toContain("Progress");
    expect(singlePageSource).not.toContain("上一步");
    expect(singlePageSource).not.toContain("下一步");
    expect(singlePageSource).not.toContain("@/components/ui/tabs");
    expect(singlePageSource).toContain(
      'from "./finance-wechat-pay-applyment-document-section"',
    );
    expect(singlePageSource).toContain(
      "<FinanceWechatPayApplymentDocumentSection",
    );
    expect(documentSectionSource).toContain(
      "<FinanceWechatPayApplymentInlineOcrReview",
    );
    expect(singlePageSource).toContain(
      "<FinanceWechatPayApplymentContactFields",
    );
    expect(singlePageSource).toContain(
      "<FinanceWechatPayApplymentSettlementFields",
    );
    expect(singlePageSource).toContain(
      "<FinanceWechatPayApplymentBusinessFields",
    );
    expect(singlePageSource).toContain("<FinanceWechatPayApplymentReview");
    expect(singlePageSource).toContain("<FinanceWechatPayApplymentActions");
    expect(workflowSource).toContain(
      'from "./finance-wechat-pay-applyment-single-page"',
    );
    expect(workflowSource).toContain("<FinanceWechatPayApplymentSinglePage");
    expect(workflowSource).not.toContain("FinanceWechatPayApplymentFlow");
    expect(panelSource).toContain("<FinanceWechatPayApplymentWorkflow");
    expect(panelSource).toContain("onChangeCapture={handleApplymentFormChange}");
    expect(panelSource).toContain("onInputCapture={handleApplymentFormInput}");
    expect(panelSource).toContain("isApplymentDataBearingControl");
    expect(panelSource).toContain("validateApplymentForm");
    expect(panelSource).not.toContain("validateAllStages");
    expect(panelSource).not.toContain("onInvalidCapture");
    expect(panelSource).not.toContain("activateInvalidApplymentElement");
  });

  test("forwards every applyment interaction from Panel through Workflow", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const workflowSource = readSource("./finance-wechat-pay-applyment-workflow.tsx");
    expect(panelSource).toContain("<FinanceWechatPayApplymentWorkflow");
    for (const callback of SINGLE_PAGE_INTERACTION_CALLBACKS) {
      expect(panelSource).toContain(`${callback}=`);
    }
    expect(workflowSource).toContain("<FinanceWechatPayApplymentSinglePage");
    for (const callback of SINGLE_PAGE_INTERACTION_CALLBACKS) {
      expectForwardedCallback(workflowSource, callback);
    }
  });

  test("uses every forwarded interaction inside the single-page form", () => {
    const singlePageUrl = new URL("./finance-wechat-pay-applyment-single-page.tsx", import.meta.url);
    expect(existsSync(singlePageUrl)).toBe(true);
    if (!existsSync(singlePageUrl)) return;
    const singlePageSource = readFileSync(singlePageUrl, "utf8");
    for (const callback of SINGLE_PAGE_INTERACTION_CALLBACKS) {
      expectUsedCallback(singlePageSource, callback);
    }
  });

  test("removes the processing event timeline from the tenant applyment panel", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    expect(panelSource).not.toContain("FinanceWechatPayApplymentEvents");
  });

  test("places both legal representative ID card sides in one responsive document section", () => {
    const documentSectionUrl = new URL(
      "./finance-wechat-pay-applyment-document-section.tsx",
      import.meta.url,
    );
    expect(existsSync(documentSectionUrl)).toBe(true);
    if (!existsSync(documentSectionUrl)) return;
    const documentSectionSource = readFileSync(documentSectionUrl, "utf8");
    expect(documentSectionSource).toContain("md:grid-cols-2");
    expect(documentSectionSource).toContain(
      "WechatPayApplymentAttachmentSlot",
    );
    expect(documentSectionSource).toContain(
      "FinanceWechatPayApplymentInlineOcrReview",
    );
    expect(documentSectionSource).toContain(
      "legal_representative_id_card_front",
    );
    expect(documentSectionSource).toContain(
      "legal_representative_id_card_back",
    );
  });

  test("persists selected OCR values and confirmed metadata atomically", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const reviewSource = readSource(
      "./finance-wechat-pay-applyment-ocr-review.tsx",
    );
    const reviewHookSource = readSource(
      "./finance-wechat-pay-applyment-ocr-review-hook.ts",
    );
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    const persistenceContract =
      `${panelSource}\n${workflowSource}\n${reviewSource}\n${reviewHookSource}`;

    expect(persistenceContract).toContain("applyRecognitionRows");
    expect(persistenceContract).toContain("row.selected");
    expect(persistenceContract).toContain("ocr_review_status: \"confirmed\"");
    expect(persistenceContract).toContain("relatedMutation");
    expect(panelSource).toContain('"ocr_confirm"');
    expect(panelSource).toContain('"manual_entry"');
  });

  test("does not report a global save success for partial material checkpoints", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    const checkpointStart = panelSource.indexOf(
      "async function persistMaterialAttachments",
    );
    const checkpointEnd = panelSource.indexOf(
      "function changeContactType",
      checkpointStart,
    );
    const checkpointSource = panelSource.slice(checkpointStart, checkpointEnd);

    expect(checkpointStart).toBeGreaterThan(-1);
    expect(checkpointEnd).toBeGreaterThan(checkpointStart);
    expect(checkpointSource).not.toContain("router.refresh()");
    expect(checkpointSource).toContain("enqueueMaterialCheckpoint");
    expect(panelSource).toContain("currentApplymentRef");
  });

  test("forwards explicit attachment mutation intents through the real panel wiring", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const attachmentSource = readSource(
      "./finance-wechat-pay-applyment-attachments.tsx",
    );
    const materialsStageSource = readSource(
      "./finance-wechat-pay-applyment-materials-stage.tsx",
    );
    const handlerStart = panelSource.indexOf(
      "async function handleAttachmentsChange",
    );
    const handlerEnd = panelSource.indexOf(
      "\n  function changeContactType",
      handlerStart,
    );
    const handlerSource = panelSource.slice(handlerStart, handlerEnd);

    expect(handlerStart).toBeGreaterThan(-1);
    expect(handlerEnd).toBeGreaterThan(handlerStart);
    expect(handlerSource).toContain(
      "options?: ApplymentAttachmentChangeOptions",
    );
    expect(handlerSource).toContain(
      "materials.onChange(nextAttachments, options)",
    );
    expect(panelSource).toContain(
      "onAttachmentsChange={handleAttachmentsChange}",
    );
    expect(materialsStageSource).toContain(
      "onChange={onAttachmentsChange}",
    );
    expect(attachmentSource).toContain(
      "intent: createApplymentAttachmentMutationIntent(",
    );
  });

  test("keeps tenant applyment client panel away from server-only request module", () => {
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const sharedSource = readSource("./finance-wechat-pay-applyment-shared.ts");
    const requestSource = readSource("./finance-wechat-pay-applyment-requests.ts");

    expect(panelSource).toContain("./finance-wechat-pay-applyment-shared");
    expect(panelSource).not.toContain("./finance-wechat-pay-applyment-requests");
    expect(sharedSource).not.toContain("@/lib/auth");
    expect(sharedSource).not.toContain("next/headers");
    expect(requestSource).toContain("./finance-wechat-pay-applyment-shared");
  });

  test("keeps shadcn controls and upload limits for the official applyment contract", () => {
    const supplementUrl = new URL(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
      import.meta.url,
    );
    const reviewUrl = new URL(
      "./finance-wechat-pay-applyment-review.tsx",
      import.meta.url,
    );
    const schemaUrl = new URL(
      "./finance-wechat-pay-applyment-schema.ts",
      import.meta.url,
    );

    expect(existsSync(supplementUrl)).toBe(true);
    expect(existsSync(reviewUrl)).toBe(true);
    expect(existsSync(schemaUrl)).toBe(true);
    if (
      !existsSync(supplementUrl) ||
      !existsSync(reviewUrl) ||
      !existsSync(schemaUrl)
    ) {
      return;
    }

    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const supplementSource = readFileSync(supplementUrl, "utf8");
    const reviewSource = readFileSync(reviewUrl, "utf8");
    const schemaSource = readFileSync(schemaUrl, "utf8");
    const attachmentSource = readSource(
      "./finance-wechat-pay-applyment-attachments.tsx",
    );
    const uploadButtonSource = readSource(
      "./finance-wechat-pay-applyment-upload-button.tsx",
    );

    expect(schemaSource).toContain("IDENTIFICATION_TYPE_IDCARD");
    expect(supplementSource).toContain("已安全保存");
    expect(reviewSource).toContain("确认资料真实有效");
    expect(schemaSource).toContain("contact_identity_number");
    expect(schemaSource).toContain("settlement_account_number");
    expect(schemaSource).toContain("delete payload.contact_identity_number");
    expect(attachmentSource).not.toContain("image/bmp");
    expect(uploadButtonSource).toContain("image/jpeg,image/png");
    expect(attachmentSource).toContain("2 * 1024 * 1024");
    expect(attachmentSource).toContain("contact_id_card_front");
    expect(attachmentSource).toContain("contact_id_card_back");
    expect(attachmentSource).toContain("MAX_BUSINESS_SCENE_MATERIALS = 5");
    expect(attachmentSource).not.toContain("image/webp");
    expect(panelSource).not.toMatch(/<select\b/);
  });
});

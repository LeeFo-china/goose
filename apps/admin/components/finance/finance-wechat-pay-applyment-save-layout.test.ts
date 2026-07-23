import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Finance wechat pay applyment save layout", () => {
  test("wires create update submit and the complete draft form contract", () => {
    const requestSource = readSource("./finance-wechat-pay-applyment-requests.ts");
    const panelSource = readSource("./finance-wechat-pay-applyment-panel.tsx");
    const materialsStageSource = readSource(
      "./finance-wechat-pay-applyment-materials-stage.tsx",
    );
    const fieldSource = readSource("./finance-wechat-pay-applyment-form-fields.tsx");
    const flowSource = readSource("./finance-wechat-pay-applyment-flow.tsx");
    const workflowSource = readSource(
      "./finance-wechat-pay-applyment-workflow.tsx",
    );
    const supplementSource = readSource(
      "./finance-wechat-pay-applyment-supplement-fields.tsx",
    );
    const schemaSource = readSource("./finance-wechat-pay-applyment-schema.ts");
    const attachmentSource = readSource("./finance-wechat-pay-applyment-attachments.tsx");
    const formContractSource =
      `${panelSource}\n${workflowSource}\n${flowSource}\n${supplementSource}\n${schemaSource}`;

    expect(requestSource).toContain("/finance/wechat-pay/applyment/current");
    expect(panelSource).toContain("/finance/wechat-pay/applyments");
    expect(panelSource).toContain("/submit");
    expect(materialsStageSource).toContain(
      "WechatPayApplymentAttachmentsField",
    );
    expect(attachmentSource).toContain("uploadDirectToCos");
    expect(attachmentSource).toContain("wechat_pay_applyment");
    expect(attachmentSource).toContain("license_copy");
    expect(attachmentSource).toContain("legal_representative_id_card_front");
    expect(`${panelSource}\n${materialsStageSource}`).toContain("attachments");
    expect(formContractSource).toContain("merchant_short_name");
    expect(formContractSource).toContain("super_admin_phone");
    expect(formContractSource).toContain("settlement_account_type");
    expect(formContractSource).toContain("settlement_account_number");
    expect(formContractSource).toContain("settlement_bank_full_name");
    expect(formContractSource).toContain("settlement_bank_branch_id");
    expect(supplementSource).toContain("settlement_account_type: value");
    expect(supplementSource).toContain("onDataChange(overrides)");
    expect(fieldSource).toContain("@/components/ui/select");
    expect(fieldSource).toContain("SelectGroup");
    expect(supplementSource).toContain('requirement="required"');
    expect(supplementSource).toContain('requirement="optional"');
    expect(formContractSource).not.toContain(
      "settlement_account_summary: requiredText",
    );
    expect(formContractSource).not.toContain("api_v3_key");
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
    expect(hookSource).not.toContain("runtime?.coordinator.dispose()");
    expect(statusSource).toContain('<Spinner aria-hidden="true" />');
  });
});

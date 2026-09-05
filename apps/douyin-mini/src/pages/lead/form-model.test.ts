import { describe, expect, test } from "bun:test";
import {
  clearLeadFieldError,
  getShanghaiNaturalDate,
  resolveLinkedBudgetContext,
  resolveOptionalDetailsExpanded,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadFormValue,
} from "./form-model";
import {
  beginIdempotentSubmission,
  createIdempotencyState,
  failIdempotentSubmission,
  updateIdempotencyDraft,
} from "../../utils/idempotency";

const VALID_FORM: LeadFormValue = {
  name: "李先生",
  phone: "13800138000",
  sms_code: "123456",
  community: "晴天花园",
  preferred_visit_date: "2026-08-25",
  preferred_visit_period: "afternoon",
  demand: "",
  consented_at: "2026-07-23T00:00:00.000Z",
};

describe("lead form model", () => {
  test("returns ordered field errors for empty required values", () => {
    const result = validateLeadForm({
      ...VALID_FORM,
      name: "",
      phone: "",
      sms_code: "",
      community: "",
      preferred_visit_date: "",
      preferred_visit_period: "",
    }, false);
    expect(result.firstField).toBe("name");
    expect(result.summary).toBe("请填写称呼");
    expect(result.fieldErrors).toEqual({
      name: "请填写称呼",
      phone: "请填写正确的手机号",
      sms_code: "请填写6位短信验证码",
      community: "请填写小区名称",
      preferred_visit_date: "请选择期望量房日期",
      preferred_visit_period: "请选择期望量房时段",
      consent: "请先阅读并同意隐私政策",
    });
  });

  test("rejects a visit date before the Shanghai natural day", () => {
    const result = validateLeadForm({
      ...VALID_FORM,
      preferred_visit_date: "2026-08-21",
    }, true, "2026-08-22");
    expect(result.firstField).toBe("preferred_visit_date");
    expect(result.fieldErrors.preferred_visit_date)
      .toBe("请选择今天或之后的量房日期");
    expect(resolveOptionalDetailsExpanded(false, result.firstField)).toBe(false);
  });

  test("derives the Shanghai day across UTC midnight and rejects impossible dates", () => {
    expect(getShanghaiNaturalDate(Date.UTC(2026, 7, 21, 15, 59, 59)))
      .toBe("2026-08-21");
    expect(getShanghaiNaturalDate(Date.UTC(2026, 7, 21, 16, 0, 0)))
      .toBe("2026-08-22");
    const result = validateLeadForm({
      ...VALID_FORM,
      preferred_visit_date: "2026-02-30",
    }, true, "2026-02-01");
    expect(result.fieldErrors.preferred_visit_date)
      .toBe("请选择今天或之后的量房日期");
  });

  test("reports consent after valid fields", () => {
    const result = validateLeadForm(
      { ...VALID_FORM, consented_at: "" },
      false,
      "2026-08-22",
    );
    expect(result.firstField).toBe("consent");
    expect(result.summary).toBe("请先阅读并同意隐私政策");
  });

  test("accepts required appointment fields on the Shanghai minimum date", () => {
    expect(validateLeadForm({
      ...VALID_FORM,
      preferred_visit_date: "2026-08-22",
    }, true, "2026-08-22")).toEqual({
      fieldErrors: {},
      firstField: null,
      summary: null,
    });
  });

  test("does not require manual phone or SMS when Douyin official phone capture is enabled", () => {
    expect(validateLeadForm({
      ...VALID_FORM,
      phone: "",
      sms_code: "",
      preferred_visit_date: "2026-08-22",
    }, true, "2026-08-22", "douyin_phone")).toEqual({
      fieldErrors: {},
      firstField: null,
      summary: null,
    });
  });

  test("clears only the changed field error", () => {
    expect(clearLeadFieldError({
      phone: "请填写正确的手机号",
      sms_code: "请填写6位短信验证码",
    }, "phone")).toEqual({ sms_code: "请填写6位短信验证码" });
  });

  test("toggles optional details without touching form values", () => {
    expect(toggleOptionalDetails(false)).toBe(true);
    expect(toggleOptionalDetails(true)).toBe(false);
  });

  test("keeps an attempted linked budget after transient TTL expiry", () => {
    const firstKey = "11111111-1111-4111-8111-111111111111";
    const linkedBudget = {
      version: 1 as const,
      estimateId: "22222222-2222-4222-8222-222222222222",
      estimateNo: "DYYS-20260820-000001",
      displayRange: "¥110,000 - ¥140,000",
      storedAt: 1_775_000_000_000,
    };
    const draft = {
      name: "李先生",
      budget_estimate_id: linkedBudget.estimateId,
    };
    const attempted = beginIdempotentSubmission(
      createIdempotencyState(draft, () => firstKey),
    );
    const failed = failIdempotentSubmission(attempted.state);
    const retained = resolveLinkedBudgetContext(linkedBudget, null, failed.status);
    const afterExpiry = updateIdempotencyDraft(failed, {
      ...draft,
      budget_estimate_id: retained?.estimateId ?? "",
    }, () => { throw new Error("exact retry must not rotate"); });
    const retry = beginIdempotentSubmission(afterExpiry);

    expect(retained).toBe(linkedBudget);
    expect(retry.key).toBe(firstKey);
    expect(retry.state.draft).toEqual(draft);

    const differentBudget = { ...linkedBudget,
      estimateId: "33333333-3333-4333-8333-333333333333" };
    expect(resolveLinkedBudgetContext(linkedBudget, differentBudget, failed.status))
      .toBe(differentBudget);
  });

  test("appointment page consumes only the approved transient budget fields", async () => {
    const [
      source,
      errorSource,
      formSource,
      template,
      successSource,
      successTemplate,
    ] = await Promise.all([
      Bun.file(`${__dirname}/lead-page.ts`).text(),
      Bun.file(`${__dirname}/lead-page-errors.ts`).text(),
      Bun.file(`${__dirname}/form-model.ts`).text(),
      Bun.file(`${__dirname}/../../components/lead-form/index.ttml`).text(),
      Bun.file(`${__dirname}/../lead-success/index.ts`).text(),
      Bun.file(`${__dirname}/../lead-success/index.ttml`).text(),
    ]);

    expect(source).toContain("readBudgetLeadContext");
    expect(source).toContain("budget_estimate_id");
    expect(source).toContain("preferred_visit_date");
    expect(source).toContain("preferred_visit_period");
    expect(source).toContain("const result = await dependencies.submitLead");
    expect(errorSource).toContain("DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH");
    expect(errorSource).toContain("DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH");
    expect(source).not.toContain("throw new TypeError");
    expect(source).toContain("failIdempotentSubmission");
    expect(source).toContain("succeedIdempotentSubmission");
    expect(source).toContain("LeadPageCoordinator");
    expect(source).toContain("finishSms");
    expect(source).toContain("finishSubmit");
    expect(source).toContain("this.lifecycle.onLoad()");
    expect(source).toContain("beginBootstrapLoad");
    expect(source).toContain("finishBootstrapLoad");
    expect(source).toContain("bootstrapSnapshot");
    expect(source).toContain("presentBootstrap");
    expect(source).toContain("app.bootstrap.getReadyOrLoad()");
    expect(source).toContain("onHide()");
    expect(source).toContain("onUnload()");
    expect(source).toContain("if (this.lifecycle.finishBootstrapLoad())");
    expect(source).toContain("cooldownUntil");
    expect(source).toContain("this.resumeCooldown()");
    expect(source).toContain("getCooldownRemainingSeconds");
    expect(source).toContain("recordSmsCooldownUntil");
    expect(source).toContain("writeMeasurementSuccessContext");
    expect(source).toContain('navigateToPage("pages/lead-success/index")');
    expect(source).not.toContain("buildLeadSuccessRoute");
    expect(source).not.toContain("successRoute");
    expect(source.indexOf("writeMeasurementSuccessContext"))
      .toBeLessThan(source.lastIndexOf("finishSubmit"));
    expect(source.indexOf("recordSmsCooldownUntil"))
      .toBeLessThan(source.indexOf("finishSms(authority)"));
    expect(formSource).toContain("budget_estimate_id: linkedBudget?.estimateId ?? \"\"");
    const frozenContextGuard = source.indexOf(
      "if (this.data.submitting) return this.linkedBudget;",
    );
    const transientRead = source.indexOf("readBudgetLeadContext()");
    expect(frozenContextGuard).toBeGreaterThan(-1);
    expect(frozenContextGuard).toBeLessThan(transientRead);
    expect(source).not.toMatch(/setStorageSync[\s\S]*(?:name|phone)/);
    expect(template).toContain('mode="date"');
    expect(template).toContain('conversion-target="{{douyinClueEnabled ? 1 : 0}}"');
    expect(template).toContain('clue-component-id="{{douyinClueComponentId}}"');
    expect(template).toContain('tt:if="{{!douyinClueEnabled}}" class="field-group"');
    expect(template).toContain('open-type="getPhoneNumber"');
    expect(template).toContain('bindgetphonenumber="onDouyinPhoneNumber"');
    expect(template).toContain("授权手机号并提交");
    expect(template).toContain("{{estimateNo}}");
    expect(template).toContain("{{estimateRange}}");
    expect(template).not.toContain('data-field="budget"');
    expect(template).not.toContain('data-field="start_time"');
    expect(template).not.toContain('data-field="area"');
    expect(successSource).toContain("readMeasurementSuccessContext");
    expect(successSource).toContain("writeBudgetResultReturnIntent");
    expect(successSource).toContain('switchToTab("budget")');
    expect(successSource).not.toContain("parseLeadSuccessOptions");
    expect(successSource).not.toMatch(/options|appointment_no|estimate_linked/);
    expect(successSource).toContain("onUnload()");
    expect(successSource).toContain("this.unloaded");
    expect(successSource).toContain("bootstrap.company.name");
    expect(successSource).toContain("bootstrap.contact_sla_text");
    expect(successTemplate).toContain("申请已提交，工作人员将与你确认具体时间");
    expect(successTemplate).toContain("{{appointmentNo}}");
    expect(successTemplate).toContain("{{companyName}}");
    expect(successTemplate).toContain("{{contactSlaText}}");
    expect(successTemplate).toContain("查看预算结果");
    expect(successTemplate).not.toContain("时间已确认");
  });
});

import { describe, expect, test } from "bun:test";
import {
  clearLeadFieldError,
  getShanghaiNaturalDate,
  resolveOptionalDetailsExpanded,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadFormValue,
} from "./form-model";
import * as formModel from "./form-model";

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
    const result = validateLeadForm({ ...VALID_FORM, consented_at: "" }, false);
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

  test("builds and strictly parses a bounded success-page route", () => {
    const build = Reflect.get(formModel, "buildLeadSuccessRoute");
    const parse = Reflect.get(formModel, "parseLeadSuccessOptions");
    expect(typeof build).toBe("function");
    expect(typeof parse).toBe("function");
    if (typeof build !== "function" || typeof parse !== "function") return;

    const route = build({
      appointmentNo: "DYLF-20260825-000001",
      preferredVisitDate: "2026-08-25",
      preferredVisitPeriod: "afternoon",
      estimateLinked: true,
    });
    const query = Object.fromEntries(new URLSearchParams(route.split("?")[1]).entries());
    expect(route.startsWith("/pages/lead-success/index?")).toBe(true);
    expect(parse(query)).toEqual({
      appointmentNo: "DYLF-20260825-000001",
      preferredVisitDate: "2026-08-25",
      preferredVisitDateLabel: "2026年8月25日",
      preferredVisitPeriod: "afternoon",
      preferredVisitPeriodLabel: "下午",
      estimateLinked: true,
    });
    expect(Array.from(new URLSearchParams(route.split("?")[1]).keys()))
      .toEqual([
        "appointment_no",
        "preferred_visit_date",
        "preferred_visit_period",
        "estimate_linked",
      ]);
    expect(parse({ ...query, customer_id: "internal" })).toBeNull();
  });

  test("appointment page consumes only the approved transient budget fields", async () => {
    const [source, template, successSource, successTemplate] = await Promise.all([
      Bun.file(`${__dirname}/index.ts`).text(),
      Bun.file(`${__dirname}/../../components/lead-form/index.ttml`).text(),
      Bun.file(`${__dirname}/../lead-success/index.ts`).text(),
      Bun.file(`${__dirname}/../lead-success/index.ttml`).text(),
    ]);

    expect(source).toContain("readBudgetLeadContext");
    expect(source).toContain("budget_estimate_id");
    expect(source).toContain("preferred_visit_date");
    expect(source).toContain("preferred_visit_period");
    expect(source).toContain("const result = await submitLead");
    expect(source).toContain("DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH");
    expect(source).toContain("DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH");
    expect(source).not.toContain("throw new TypeError");
    expect(source).toContain("failIdempotentSubmission");
    expect(source).toContain("succeedIdempotentSubmission");
    expect(source).toContain("budget_estimate_id: linkedBudget?.estimateId ?? \"\"");
    const frozenContextGuard = source.indexOf(
      "if (this.data.submitting) return this.linkedBudget;",
    );
    const transientRead = source.indexOf("const context = readBudgetLeadContext();");
    expect(frozenContextGuard).toBeGreaterThan(-1);
    expect(frozenContextGuard).toBeLessThan(transientRead);
    expect(source).not.toMatch(/setStorageSync[\s\S]*(?:name|phone)/);
    expect(template).toContain('mode="date"');
    expect(template).toContain("{{estimateNo}}");
    expect(template).toContain("{{estimateRange}}");
    expect(template).not.toContain('data-field="budget"');
    expect(template).not.toContain('data-field="start_time"');
    expect(template).not.toContain('data-field="area"');
    expect(successSource).toContain('switchToTab("budget")');
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

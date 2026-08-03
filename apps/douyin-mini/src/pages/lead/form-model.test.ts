import { describe, expect, test } from "bun:test";
import {
  clearLeadFieldError,
  resolveOptionalDetailsExpanded,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadFormValue,
} from "./form-model";

const VALID_FORM: LeadFormValue = {
  name: "李先生",
  phone: "13800138000",
  sms_code: "123456",
  community: "",
  area: "",
  budget: "",
  start_time: "",
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
    }, false);
    expect(result.firstField).toBe("name");
    expect(result.summary).toBe("请填写称呼");
    expect(result.fieldErrors).toEqual({
      name: "请填写称呼",
      phone: "请填写正确的手机号",
      sms_code: "请填写6位短信验证码",
      consent: "请先阅读并同意隐私政策",
    });
  });

  test("reports an invalid optional area and expands optional details", () => {
    const result = validateLeadForm({ ...VALID_FORM, area: "0" }, true);
    expect(result.firstField).toBe("area");
    expect(result.fieldErrors.area).toBe("请填写正确的房屋面积");
    expect(resolveOptionalDetailsExpanded(false, result.firstField)).toBe(true);
  });

  test("reports consent after valid fields", () => {
    const result = validateLeadForm({ ...VALID_FORM, consented_at: "" }, false);
    expect(result.firstField).toBe("consent");
    expect(result.summary).toBe("请先阅读并同意隐私政策");
  });

  test("accepts valid required fields and an optional positive area", () => {
    expect(validateLeadForm({ ...VALID_FORM, area: "98.5" }, true)).toEqual({
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
});

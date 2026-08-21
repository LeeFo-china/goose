import type { DouyinAppContext } from "../../app";
import { sendLeadSms, submitLead } from "../../api/leads";
import { ApiRequestError } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import type { DouyinVisitPeriod } from "../../models";
import {
  readBudgetLeadContext,
  type BudgetLeadContext,
} from "../../platform/budget-lead-context";
import { navigateToPage } from "../../platform/navigation";
import {
  readMeasurementSuccessContext,
  writeMeasurementSuccessContext,
} from "../../platform/measurement-success-context";
import {
  beginIdempotentSubmission,
  createIdempotencyState,
  failIdempotentSubmission,
  succeedIdempotentSubmission,
  updateIdempotencyDraft,
} from "../../utils/idempotency";
import {
  clearLeadFieldError,
  getShanghaiNaturalDate,
  resolveLinkedBudgetContext,
  resolveOptionalDetailsExpanded,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadField,
  type LeadFieldErrors,
  type LeadFormValue,
} from "./form-model";
import {
  LeadPageCoordinator,
  getCooldownRemainingSeconds,
} from "./lead-page-coordinator";

const INITIAL_FORM: LeadFormValue = {
  name: "",
  phone: "",
  sms_code: "",
  community: "",
  preferred_visit_date: "",
  preferred_visit_period: "",
  demand: "",
  consented_at: "",
};
const LEAD_FIELDS = new Set<LeadField>([
  "name",
  "phone",
  "sms_code",
  "community",
  "preferred_visit_date",
  "preferred_visit_period",
  "demand",
  "consented_at",
]);

Page({
  idempotency: createIdempotencyState(toIdempotencyDraft(INITIAL_FORM, "", null)),
  linkedBudget: null as BudgetLeadContext | null,
  lifecycle: new LeadPageCoordinator(),
  cooldownTimer: null as ReturnType<typeof setInterval> | null,
  cooldownUntil: 0,
  successNavigationInFlight: false,
  data: {
    loading: true,
    error: false,
    disabled: false,
    companyName: "装修服务提供方",
    servicePhone: "",
    primaryColor: "#191817",
    primaryTextColor: "#FFFFFF",
    privacyPolicyVersion: "",
    minVisitDate: getShanghaiNaturalDate(),
    estimateNo: "",
    estimateRange: "",
    hasLinkedEstimate: false,
    form: { ...INITIAL_FORM },
    consented: false,
    phoneReady: false,
    smsSending: false,
    smsCooldown: 0,
    submitting: false,
    formError: "",
    fieldErrors: {} as LeadFieldErrors,
    focusedField: "",
    optionalDetailsExpanded: false,
  },
  onLoad() {
    this.lifecycle.onLoad();
    void this.load();
  },
  onShow() {
    this.lifecycle.onShow();
    if (!this.lifecycle.isVisible()) return;
    this.setData({ smsSending: false, submitting: false });
    this.syncBudgetContext();
    this.resumeCooldown();
  },
  onHide() {
    if (!this.lifecycle.onHide()) return;
    this.idempotency = failIdempotentSubmission(this.idempotency);
    this.stopCooldown();
  },
  onUnload() {
    this.lifecycle.onUnload();
    this.idempotency = failIdempotentSubmission(this.idempotency);
    this.stopCooldown();
    this.cooldownUntil = 0;
  },
  async load() {
    this.setData({ loading: true, error: false });
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap || !this.lifecycle.isVisible()) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
      this.idempotency = updateIdempotencyDraft(
        this.idempotency,
        toIdempotencyDraft(
          this.data.form,
          bootstrap.privacy_policy_version,
          this.linkedBudget,
        ),
      );
      this.setData({
        loading: false,
        disabled: !bootstrap.features.sms_lead,
        companyName: bootstrap.company.name,
        servicePhone: bootstrap.company.service_phone,
        primaryColor: theme.primaryColor,
        primaryTextColor: theme.primaryTextColor,
        privacyPolicyVersion: bootstrap.privacy_policy_version,
      });
      getApp<DouyinAppContext>().recordAnalytics("page_view");
    } catch {
      if (this.lifecycle.isVisible()) {
        this.setData({ loading: false, error: true });
      }
    }
  },
  syncBudgetContext() {
    if (this.data.submitting) return this.linkedBudget;
    const context = resolveLinkedBudgetContext(
      this.linkedBudget,
      readBudgetLeadContext(),
      this.idempotency.status,
    );
    this.linkedBudget = context;
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toIdempotencyDraft(this.data.form, this.data.privacyPolicyVersion, context),
    );
    this.setData({
      minVisitDate: getShanghaiNaturalDate(),
      estimateNo: context?.estimateNo ?? "",
      estimateRange: context?.displayRange ?? "",
      hasLinkedEstimate: context !== null,
    });
    return context;
  },
  onFieldChange(event: { detail: { field?: string; value?: string } }) {
    if (this.data.submitting) return;
    const field = event.detail.field as LeadField;
    if (!LEAD_FIELDS.has(field) || field === "consented_at"
      || typeof event.detail.value !== "string") return;
    const value = sanitizeField(field, event.detail.value);
    const form = { ...this.data.form, [field]: value } as LeadFormValue;
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toIdempotencyDraft(form, this.data.privacyPolicyVersion, this.linkedBudget),
    );
    this.setData({
      form,
      fieldErrors: clearLeadFieldError(this.data.fieldErrors, field),
      focusedField: "",
      phoneReady: /^1[3-9][0-9]{9}$/.test(form.phone),
      formError: "",
    });
  },
  onConsentChange(event: { detail: { checked: boolean } }) {
    if (this.data.submitting) return;
    const consented = event.detail.checked === true;
    const form = {
      ...this.data.form,
      consented_at: consented ? new Date().toISOString() : "",
    };
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toIdempotencyDraft(form, this.data.privacyPolicyVersion, this.linkedBudget),
    );
    this.setData({
      consented,
      form,
      fieldErrors: clearLeadFieldError(this.data.fieldErrors, "consent"),
      focusedField: "",
      formError: "",
    });
  },
  onOpenPolicy() {
    if (this.data.submitting) return;
    void navigateToPage("pages/privacy/index")
      .catch(() => this.setData({ formError: "隐私政策页面打开失败，请稍后重试" }));
  },
  async onSendSms() {
    if (this.data.submitting || this.data.smsCooldown > 0) return;
    const phone = this.data.form.phone.trim();
    if (!/^1[3-9][0-9]{9}$/.test(phone)) {
      const phoneError = "请先填写正确的手机号";
      this.setData({
        fieldErrors: { ...this.data.fieldErrors, phone: phoneError },
        focusedField: "phone",
        formError: phoneError,
      });
      return;
    }
    const authority = this.lifecycle.beginSms();
    if (!authority) return;
    this.setData({ smsSending: true, formError: "" });
    try {
      const app = getApp<DouyinAppContext>();
      const result = await sendLeadSms(app.api, { phone, attribution: app.launchContext });
      if (!this.lifecycle.finishSms(authority)) return;
      this.startCooldown(result.cooldown_seconds);
      this.setData({ smsSending: false });
      void tt.showToast({ title: "验证码已发送", icon: "none" });
    } catch (error) {
      if (!this.lifecycle.finishSms(authority)) return;
      this.setData({
        smsSending: false,
        formError: readableError(error, "验证码发送失败，请稍后重试"),
      });
    }
  },
  onToggleOptionalDetails() {
    if (this.data.submitting) return;
    this.setData({
      optionalDetailsExpanded: toggleOptionalDetails(this.data.optionalDetailsExpanded),
    });
  },
  async onSubmit() {
    const linkedBudget = this.syncBudgetContext();
    const minimumVisitDate = getShanghaiNaturalDate();
    this.setData({ minVisitDate: minimumVisitDate });
    const validation = validateLeadForm(
      this.data.form,
      this.data.consented,
      minimumVisitDate,
    );
    if (validation.summary) {
      this.setData({
        fieldErrors: validation.fieldErrors,
        focusedField: validation.firstField === "consent"
          ? ""
          : validation.firstField || "",
        optionalDetailsExpanded: resolveOptionalDetailsExpanded(
          this.data.optionalDetailsExpanded,
          validation.firstField,
        ),
        formError: validation.summary,
      });
      return;
    }
    const preferredVisitPeriod = toVisitPeriod(this.data.form.preferred_visit_period);
    if (!preferredVisitPeriod) {
      const message = "请选择期望量房时段";
      this.setData({
        fieldErrors: { ...this.data.fieldErrors, preferred_visit_period: message },
        focusedField: "preferred_visit_period",
        formError: message,
      });
      return;
    }
    const decision = beginIdempotentSubmission(this.idempotency);
    this.idempotency = decision.state;
    if (!decision.shouldSubmit) {
      if (decision.state.status === "succeeded") this.openSuccessPage();
      return;
    }
    const authority = this.lifecycle.beginSubmit();
    if (!authority) {
      this.idempotency = failIdempotentSubmission(this.idempotency);
      return;
    }
    this.setData({ submitting: true, formError: "", fieldErrors: {}, focusedField: "" });
    try {
      const app = getApp<DouyinAppContext>();
      const form = this.data.form;
      const result = await submitLead(app.api, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        sms_code: form.sms_code.trim(),
        community: form.community.trim(),
        preferred_visit_date: form.preferred_visit_date,
        preferred_visit_period: preferredVisitPeriod,
        ...(linkedBudget ? { budget_estimate_id: linkedBudget.estimateId } : {}),
        ...optionalDemand(form.demand),
        privacy_policy_version: this.data.privacyPolicyVersion,
        consented_at: form.consented_at,
        idempotency_key: decision.key,
        attribution: app.launchContext,
      });
      const succeeded = succeedIdempotentSubmission(this.idempotency, decision.key);
      const acceptedAttempt = succeeded.key === decision.key
        && succeeded.status === "succeeded";
      if (acceptedAttempt) this.idempotency = succeeded;
      const recorded = acceptedAttempt && writeMeasurementSuccessContext({
        appointmentNo: result.appointment_no,
        preferredVisitDate: form.preferred_visit_date,
        preferredVisitPeriod,
        linkedEstimateId: linkedBudget?.estimateId ?? null,
      });
      const canPresent = this.lifecycle.finishSubmit(authority);
      if (!acceptedAttempt || !canPresent) return;
      if (!recorded) {
        this.setData({
          submitting: false,
          formError: "申请已提交，结果暂时无法显示，请返回后重试",
        });
        return;
      }
    } catch (error) {
      if (!this.lifecycle.finishSubmit(authority)) return;
      if (this.idempotency.status === "succeeded"
        && readMeasurementSuccessContext()) {
        this.setData({ submitting: false });
        this.openSuccessPage();
        return;
      }
      this.idempotency = failIdempotentSubmission(this.idempotency);
      if (isPrivacyVersionMismatch(error)) {
        this.setData({ formError: "隐私政策正在更新，请稍候" });
        await this.refreshPrivacyPolicy();
      } else {
        this.setData({ formError: readableError(error, "提交失败，请检查网络后重试") });
      }
      this.setData({ submitting: false });
      return;
    }
    this.setData({ submitting: false });
    this.openSuccessPage();
  },
  async refreshPrivacyPolicy() {
    const app = getApp<DouyinAppContext>();
    try {
      const bootstrap = await app.bootstrap.load();
      if (!bootstrap || !this.lifecycle.isVisible()) return;
      const form = { ...this.data.form, consented_at: "" };
      this.idempotency = updateIdempotencyDraft(
        this.idempotency,
        toIdempotencyDraft(form, bootstrap.privacy_policy_version, this.linkedBudget),
      );
      this.setData({
        form,
        consented: false,
        privacyPolicyVersion: bootstrap.privacy_policy_version,
        fieldErrors: {
          ...this.data.fieldErrors,
          consent: "隐私政策已更新，请重新阅读并确认后提交",
        },
        focusedField: "",
        formError: "隐私政策已更新，请重新阅读并确认后提交",
      });
    } catch {
      if (this.lifecycle.isVisible()) {
        this.setData({ formError: "隐私政策已更新，请稍后重新进入量房页" });
      }
    }
  },
  openSuccessPage() {
    if (this.successNavigationInFlight || !this.lifecycle.isVisible()
      || !readMeasurementSuccessContext()) return;
    this.successNavigationInFlight = true;
    void navigateToPage("pages/lead-success/index")
      .catch(() => {
        if (this.lifecycle.isVisible()) this.setData({
          formError: "申请已提交，点击提交按钮可重新打开结果页",
        });
      })
      .finally(() => { this.successNavigationInFlight = false; });
  },
  onPhoneCall() {
    const phoneNumber = this.data.servicePhone;
    if (!phoneNumber) return;
    getApp<DouyinAppContext>().recordAnalytics("phone_call_click");
    tt.makePhoneCall({
      phoneNumber,
      fail: () => tt.showToast({ title: "未能发起拨号，请稍后重试", icon: "none" }),
    });
  },
  startCooldown(seconds: number) {
    this.cooldownUntil = Date.now() + seconds * 1_000;
    this.resumeCooldown();
  },
  resumeCooldown() {
    this.stopCooldown();
    if (!this.lifecycle.isVisible()) return;
    const remaining = getCooldownRemainingSeconds(this.cooldownUntil);
    this.setData({ smsCooldown: remaining });
    if (remaining === 0) return;
    this.cooldownTimer = setInterval(() => {
      if (!this.lifecycle.isVisible()) {
        this.stopCooldown();
        return;
      }
      const next = getCooldownRemainingSeconds(this.cooldownUntil);
      this.setData({ smsCooldown: next });
      if (next === 0) this.stopCooldown();
    }, 1_000);
  },
  stopCooldown() {
    if (this.cooldownTimer !== null) clearInterval(this.cooldownTimer);
    this.cooldownTimer = null;
  },
});

function sanitizeField(field: LeadField, value: string): string {
  if (field === "phone") return value.replace(/[^0-9]/g, "").slice(0, 11);
  if (field === "sms_code") return value.replace(/[^0-9]/g, "").slice(0, 6);
  if (field === "preferred_visit_date") return value.slice(0, 10);
  if (field === "preferred_visit_period") return value.slice(0, 16);
  const limits: Partial<Record<LeadField, number>> = {
    name: 40,
    community: 80,
    demand: 1_000,
  };
  return value.slice(0, limits[field] ?? value.length);
}

function optionalDemand(value: string): { demand?: string } {
  const normalized = value.trim();
  return normalized ? { demand: normalized } : {};
}

function toIdempotencyDraft(
  form: LeadFormValue,
  privacyPolicyVersion: string,
  linkedBudget: BudgetLeadContext | null,
) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    community: form.community.trim(),
    preferred_visit_date: form.preferred_visit_date,
    preferred_visit_period: form.preferred_visit_period,
    budget_estimate_id: linkedBudget?.estimateId ?? "",
    demand: form.demand.trim(),
    consented_at: form.consented_at,
    privacy_policy_version: privacyPolicyVersion,
  };
}

function toVisitPeriod(
  value: LeadFormValue["preferred_visit_period"],
): DouyinVisitPeriod | null {
  if (value === "morning" || value === "afternoon" || value === "evening") return value;
  return null;
}

function isPrivacyVersionMismatch(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError
    && (error.code === "DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH"
      || error.code === "DOUYIN_MEASUREMENT_PRIVACY_VERSION_MISMATCH");
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.message.trim()
    ? error.message
    : fallback;
}

import type { DouyinAppContext } from "../../app";
import { sendLeadSms, submitLead } from "../../api/leads";
import { ApiRequestError } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import type {
  DouyinMeasurementAppointmentResult,
  DouyinVisitPeriod,
} from "../../models";
import {
  readBudgetLeadContext,
  type BudgetLeadContext,
} from "../../platform/budget-lead-context";
import { navigateToPage } from "../../platform/navigation";
import {
  beginIdempotentSubmission,
  createIdempotencyState,
  failIdempotentSubmission,
  succeedIdempotentSubmission,
  updateIdempotencyDraft,
} from "../../utils/idempotency";
import {
  buildLeadSuccessRoute,
  clearLeadFieldError,
  getShanghaiNaturalDate,
  resolveOptionalDetailsExpanded,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadField,
  type LeadFieldErrors,
  type LeadFormValue,
} from "./form-model";

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
  successRoute: "",
  cooldownTimer: null as ReturnType<typeof setInterval> | null,
  smsInFlight: false,
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
  onLoad() { void this.load(); },
  onShow() { this.syncBudgetContext(); },
  onUnload() { this.stopCooldown(); },
  async load() {
    this.setData({ loading: true, error: false });
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap) return;
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
      this.setData({ loading: false, error: true });
    }
  },
  syncBudgetContext() {
    if (this.data.submitting) return this.linkedBudget;
    const context = readBudgetLeadContext();
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
    if (this.data.submitting || this.smsInFlight || this.data.smsCooldown > 0) return;
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
    this.smsInFlight = true;
    this.setData({ smsSending: true, formError: "" });
    try {
      const app = getApp<DouyinAppContext>();
      const result = await sendLeadSms(app.api, { phone, attribution: app.launchContext });
      this.startCooldown(result.cooldown_seconds);
      void tt.showToast({ title: "验证码已发送", icon: "none" });
    } catch (error) {
      this.setData({ formError: readableError(error, "验证码发送失败，请稍后重试") });
    } finally {
      this.smsInFlight = false;
      this.setData({ smsSending: false });
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
      this.successRoute = toSuccessRoute(
        result,
        form.preferred_visit_date,
        preferredVisitPeriod,
        linkedBudget !== null,
      );
      this.idempotency = succeedIdempotentSubmission(this.idempotency);
    } catch (error) {
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
      if (!bootstrap) return;
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
      this.setData({ formError: "隐私政策已更新，请稍后重新进入量房页" });
    }
  },
  openSuccessPage() {
    if (this.successNavigationInFlight || !this.successRoute) return;
    this.successNavigationInFlight = true;
    tt.navigateTo({
      url: this.successRoute,
      fail: () => this.setData({
        formError: "申请已提交，点击提交按钮可重新打开结果页",
      }),
      complete: () => { this.successNavigationInFlight = false; },
    });
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
    this.stopCooldown();
    this.setData({ smsCooldown: seconds });
    this.cooldownTimer = setInterval(() => {
      const next = Math.max(0, this.data.smsCooldown - 1);
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

function toSuccessRoute(
  result: DouyinMeasurementAppointmentResult,
  preferredVisitDate: string,
  preferredVisitPeriod: DouyinVisitPeriod,
  estimateLinked: boolean,
): string {
  return buildLeadSuccessRoute({
    appointmentNo: result.appointment_no,
    preferredVisitDate,
    preferredVisitPeriod,
    estimateLinked,
  });
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

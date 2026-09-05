import type { DouyinAppContext } from "../../app";
import type { sendLeadSms, submitLead } from "../../api/leads";
import { resolveThemeColor } from "../../components/theme";
import type { BootstrapData } from "../../models";
import type {
  readBudgetLeadContext,
} from "../../platform/budget-lead-context";
import type { BudgetLeadContext } from "../../platform/budget-lead-context";
import type { navigateToPage } from "../../platform/navigation";
import type {
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
  optionalLeadDemand,
  resolveLinkedBudgetContext,
  resolveOptionalDetailsExpanded,
  sanitizeLeadField,
  toLeadIdempotencyDraft,
  toLeadVisitPeriod,
  toggleOptionalDetails,
  validateLeadForm,
  type LeadField,
  type LeadFieldErrors,
  type LeadFormValue,
} from "./form-model";
import { INITIAL_FORM, LEAD_FIELDS } from "./lead-page-constants";
import {
  LeadPageCoordinator,
  getCooldownRemainingSeconds,
  recordSmsCooldownUntil,
  type LeadOperationAuthority,
} from "./lead-page-coordinator";
import { isPrivacyVersionMismatch, readableError } from "./lead-page-errors";
import { runPolicyNavigation, runPrivacyPolicyRefresh } from "./lead-page-operations";

export type LeadPageDependencies = {
  getApp(): DouyinAppContext;
  sendLeadSms: typeof sendLeadSms;
  submitLead: typeof submitLead;
  readBudgetLeadContext: typeof readBudgetLeadContext;
  readMeasurementSuccessContext: typeof readMeasurementSuccessContext;
  writeMeasurementSuccessContext: typeof writeMeasurementSuccessContext;
  navigateToPage: typeof navigateToPage;
  showToast(options: { title: string; icon: "none" }): void;
  makePhoneCall(options: { phoneNumber: string; fail(): void }): void;
};

export function createLeadPageDefinition(dependencies: LeadPageDependencies) {
  return definePage({
  idempotency: createIdempotencyState(toLeadIdempotencyDraft(INITIAL_FORM, "", null)),
  linkedBudget: null as BudgetLeadContext | null,
  lifecycle: new LeadPageCoordinator(),
  cooldownTimer: null as ReturnType<typeof setInterval> | null,
  cooldownUntil: 0,
  bootstrapSnapshot: null as BootstrapData | null,
  initialBootstrapConsumed: false,
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
    douyinClueEnabled: false,
    douyinClueComponentId: "",
  },
  onLoad() {
    this.lifecycle.onLoad();
    void this.load();
  },
  onShow() {
    const becameVisible = this.lifecycle.onShow();
    if (!this.lifecycle.isVisible()) return;
    this.setData({ smsSending: false, submitting: false });
    this.syncBudgetContext();
    this.resumeCooldown();
    if (becameVisible && (this.data.loading || this.data.error)) {
      if (this.bootstrapSnapshot) this.presentBootstrap(this.bootstrapSnapshot);
      else void this.load();
    }
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
    if (!this.lifecycle.beginBootstrapLoad()) return;
    if (this.lifecycle.isVisible()) this.setData({ loading: true, error: false });
    let bootstrap: BootstrapData | null;
    try {
      const app = dependencies.getApp();
      const bootstrapFlight = this.initialBootstrapConsumed
        ? app.bootstrap.getReadyOrLoad()
        : app.startup;
      this.initialBootstrapConsumed = true;
      bootstrap = await bootstrapFlight;
    } catch {
      if (this.lifecycle.finishBootstrapLoad()) this.setData({ loading: false, error: true });
      return;
    }
    if (bootstrap) this.bootstrapSnapshot = bootstrap;
    if (!this.lifecycle.finishBootstrapLoad() || !bootstrap) return;
    this.presentBootstrap(bootstrap);
  },
  presentBootstrap(bootstrap: BootstrapData) {
    if (!this.lifecycle.isVisible()) return;
    const theme = resolveThemeColor(bootstrap.theme.primary_color);
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toLeadIdempotencyDraft(
        this.data.form,
        bootstrap.privacy_policy_version,
        this.linkedBudget,
      ),
    );
    this.setData({
      loading: false,
      error: false,
      disabled: !bootstrap.features.sms_lead,
      companyName: bootstrap.company.name,
      servicePhone: bootstrap.company.service_phone,
      primaryColor: theme.primaryColor,
      primaryTextColor: theme.primaryTextColor,
      privacyPolicyVersion: bootstrap.privacy_policy_version,
      douyinClueEnabled: bootstrap.features.douyin_phone,
      douyinClueComponentId: bootstrap.features.douyin_phone
        ? bootstrap.features.clue_component_id
        : "",
    });
    dependencies.getApp().recordAnalytics("page_view");
  },
  syncBudgetContext() {
    if (this.data.submitting) return this.linkedBudget;
    const context = resolveLinkedBudgetContext(
      this.linkedBudget,
      dependencies.readBudgetLeadContext(),
      this.idempotency.status,
    );
    this.linkedBudget = context;
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toLeadIdempotencyDraft(this.data.form, this.data.privacyPolicyVersion, context),
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
    const value = sanitizeLeadField(field, event.detail.value);
    const form = { ...this.data.form, [field]: value } as LeadFormValue;
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toLeadIdempotencyDraft(form, this.data.privacyPolicyVersion, this.linkedBudget),
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
      toLeadIdempotencyDraft(form, this.data.privacyPolicyVersion, this.linkedBudget),
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
    void runPolicyNavigation({
      coordinator: this.lifecycle,
      navigate: () => dependencies.navigateToPage("pages/privacy/index"),
      onFailure: () => this.setData({ formError: "隐私政策页面打开失败，请稍后重试" }),
    });
  },
  async onSendSms() {
    if (this.data.submitting || getCooldownRemainingSeconds(this.cooldownUntil) > 0) return;
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
      const app = dependencies.getApp();
      const result = await dependencies.sendLeadSms(app.api, {
        phone,
        attribution: app.launchContext,
      });
      this.cooldownUntil = recordSmsCooldownUntil(
        this.cooldownUntil,
        result.cooldown_seconds,
      );
      if (!this.lifecycle.finishSms(authority)) return;
      this.resumeCooldown();
      this.setData({ smsSending: false });
      dependencies.showToast({ title: "验证码已发送", icon: "none" });
    } catch (error) {
      if (!this.lifecycle.finishSms(authority)) return;
      this.resumeCooldown();
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
    const preferredVisitPeriod = toLeadVisitPeriod(this.data.form.preferred_visit_period);
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
      const app = dependencies.getApp();
      const form = this.data.form;
      const result = await dependencies.submitLead(app.api, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        sms_code: form.sms_code.trim(),
        community: form.community.trim(),
        preferred_visit_date: form.preferred_visit_date,
        preferred_visit_period: preferredVisitPeriod,
        ...(linkedBudget ? { budget_estimate_id: linkedBudget.estimateId } : {}),
        ...optionalLeadDemand(form.demand),
        privacy_policy_version: this.data.privacyPolicyVersion,
        consented_at: form.consented_at,
        idempotency_key: decision.key,
        attribution: app.launchContext,
      });
      const succeeded = succeedIdempotentSubmission(this.idempotency, decision.key);
      const acceptedAttempt = succeeded.key === decision.key
        && succeeded.status === "succeeded";
      if (acceptedAttempt) this.idempotency = succeeded;
      const recorded = acceptedAttempt && dependencies.writeMeasurementSuccessContext({
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
      if (this.idempotency.status === "succeeded"
        && dependencies.readMeasurementSuccessContext()) {
        if (!this.lifecycle.finishSubmit(authority)) return;
        this.setData({ submitting: false });
        this.openSuccessPage();
        return;
      }
      if (isPrivacyVersionMismatch(error)) {
        await this.refreshPrivacyPolicy(authority);
        return;
      }
      if (!this.lifecycle.finishSubmit(authority)) return;
      this.idempotency = failIdempotentSubmission(this.idempotency);
      this.setData({
        submitting: false,
        formError: readableError(error, "提交失败，请检查网络后重试"),
      });
      return;
    }
    this.setData({ submitting: false });
    this.openSuccessPage();
  },
  async refreshPrivacyPolicy(authority: LeadOperationAuthority) {
    const app = dependencies.getApp();
    await runPrivacyPolicyRefresh({
      coordinator: this.lifecycle,
      authority,
      refresh: () => app.bootstrap.load(),
      onPending: () => {
        this.idempotency = failIdempotentSubmission(this.idempotency);
        this.setData({ formError: "隐私政策正在更新，请稍候" });
      },
      onSuccess: (bootstrap) => {
        const form = { ...this.data.form, consented_at: "" };
        this.idempotency = updateIdempotencyDraft(this.idempotency,
          toLeadIdempotencyDraft(form, bootstrap.privacy_policy_version, this.linkedBudget));
        this.setData({
          submitting: false,
          form, consented: false,
          privacyPolicyVersion: bootstrap.privacy_policy_version,
          fieldErrors: { ...this.data.fieldErrors,
            consent: "隐私政策已更新，请重新阅读并确认后提交" },
          focusedField: "",
          formError: "隐私政策已更新，请重新阅读并确认后提交",
        });
      },
      onFailure: () => this.setData({
        submitting: false,
        formError: "隐私政策已更新，请稍后重新进入量房页",
      }),
    });
  },
  openSuccessPage() {
    if (this.successNavigationInFlight || !this.lifecycle.isVisible()
      || !dependencies.readMeasurementSuccessContext()) return;
    this.successNavigationInFlight = true;
    void dependencies.navigateToPage("pages/lead-success/index")
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
    dependencies.getApp().recordAnalytics("phone_call_click");
    dependencies.makePhoneCall({
      phoneNumber,
      fail: () => dependencies.showToast({
        title: "未能发起拨号，请稍后重试",
        icon: "none",
      }),
    });
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
}

function definePage<
  TData extends Record<string, unknown>,
  TCustom extends Record<string, unknown>,
>(options: TCustom & { data: TData } & ThisType<
  TCustom & { data: TData; setData(patch: Partial<TData>): void }
>): TCustom & { data: TData } {
  return options;
}

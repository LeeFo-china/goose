import type { DouyinAppContext } from "../../app";
import { sendLeadSms, submitLead } from "../../api/leads";
import { ApiRequestError } from "../../api/request";
import { resolveThemeColor } from "../../components/theme";
import { navigateToPage } from "../../platform/navigation";
import {
  beginIdempotentSubmission,
  createIdempotencyState,
  failIdempotentSubmission,
  succeedIdempotentSubmission,
  updateIdempotencyDraft,
} from "../../utils/idempotency";

type LeadField = keyof LeadFormValue;
type LeadFormValue = {
  name: string;
  phone: string;
  sms_code: string;
  community: string;
  area: string;
  budget: string;
  start_time: string;
  demand: string;
  consented_at: string;
};

const INITIAL_FORM: LeadFormValue = {
  name: "",
  phone: "",
  sms_code: "",
  community: "",
  area: "",
  budget: "",
  start_time: "",
  demand: "",
  consented_at: "",
};
const LEAD_FIELDS = new Set<LeadField>([
  "name", "phone", "sms_code", "community", "area", "budget", "start_time",
  "demand", "consented_at",
]);

Page({
  idempotency: createIdempotencyState(toIdempotencyDraft(INITIAL_FORM, "")),
  cooldownTimer: null as ReturnType<typeof setInterval> | null,
  smsInFlight: false,
  successNavigationInFlight: false,
  data: {
    loading: true,
    error: false,
    disabled: false,
    companyName: "装修服务提供方",
    servicePhone: "",
    primaryColor: "#C45A32",
    primaryTextColor: "#000000",
    privacyPolicyVersion: "",
    form: { ...INITIAL_FORM },
    consented: false,
    phoneReady: false,
    smsSending: false,
    smsCooldown: 0,
    submitting: false,
    formError: "",
  },
  onLoad() { void this.load(); },
  onUnload() { this.stopCooldown(); },
  async load() {
    this.setData({ loading: true, error: false });
    try {
      const bootstrap = await getApp<DouyinAppContext>().startup;
      if (!bootstrap) return;
      const theme = resolveThemeColor(bootstrap.theme.primary_color);
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
  onFieldChange(event: { detail: { field?: string; value?: string } }) {
    if (this.data.submitting) return;
    const field = event.detail.field as LeadField;
    if (!LEAD_FIELDS.has(field) || field === "consented_at"
      || typeof event.detail.value !== "string") return;
    const value = sanitizeField(field, event.detail.value);
    const form = { ...this.data.form, [field]: value };
    this.idempotency = updateIdempotencyDraft(
      this.idempotency,
      toIdempotencyDraft(form, this.data.privacyPolicyVersion),
    );
    this.setData({
      form,
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
      toIdempotencyDraft(form, this.data.privacyPolicyVersion),
    );
    this.setData({ consented, form, formError: "" });
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
      this.setData({ formError: "请先填写正确的手机号" });
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
  async onSubmit() {
    const errorMessage = validateForm(this.data.form, this.data.consented);
    if (errorMessage) {
      this.setData({ formError: errorMessage });
      return;
    }
    const decision = beginIdempotentSubmission(this.idempotency);
    this.idempotency = decision.state;
    if (!decision.shouldSubmit) {
      if (decision.state.status === "succeeded") this.openSuccessPage();
      return;
    }
    this.setData({ submitting: true, formError: "" });
    try {
      const app = getApp<DouyinAppContext>();
      const form = this.data.form;
      await submitLead(app.api, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        sms_code: form.sms_code.trim(),
        ...optionalText("community", form.community),
        ...optionalArea(form.area),
        ...optionalText("budget", form.budget),
        ...optionalText("start_time", form.start_time),
        ...optionalText("demand", form.demand),
        privacy_policy_version: this.data.privacyPolicyVersion,
        consented_at: form.consented_at,
        idempotency_key: decision.key,
        attribution: app.launchContext,
      });
      this.idempotency = succeedIdempotentSubmission(this.idempotency);
    } catch (error) {
      this.idempotency = failIdempotentSubmission(this.idempotency);
      if (error instanceof ApiRequestError
        && error.code === "DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH") {
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
        toIdempotencyDraft(form, bootstrap.privacy_policy_version),
      );
      this.setData({
        form,
        consented: false,
        privacyPolicyVersion: bootstrap.privacy_policy_version,
        formError: "隐私政策已更新，请重新阅读并确认后提交",
      });
    } catch {
      this.setData({ formError: "隐私政策已更新，请稍后重新进入咨询页" });
    }
  },
  openSuccessPage() {
    if (this.successNavigationInFlight) return;
    this.successNavigationInFlight = true;
    void navigateToPage("pages/lead-success/index")
      .catch(() => this.setData({ formError: "需求已提交，点击提交按钮可重新打开结果页" }))
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
  if (field === "area") return value.replace(/[^0-9.]/g, "").slice(0, 8);
  const limits: Partial<Record<LeadField, number>> = {
    name: 40, community: 80, budget: 40, start_time: 40, demand: 1_000,
  };
  return value.slice(0, limits[field] ?? value.length);
}

function validateForm(form: LeadFormValue, consented: boolean): string | null {
  if (!form.name.trim()) return "请填写称呼";
  if (!/^1[3-9][0-9]{9}$/.test(form.phone.trim())) return "请填写正确的手机号";
  if (!/^[0-9]{6}$/.test(form.sms_code.trim())) return "请填写6位短信验证码";
  if (form.area.trim()) {
    const area = Number(form.area);
    if (!Number.isFinite(area) || area <= 0 || area > 100_000) return "请填写正确的房屋面积";
  }
  if (!consented || !form.consented_at) return "请先阅读并同意隐私政策";
  return null;
}

function optionalText<Key extends "community" | "budget" | "start_time" | "demand">(
  key: Key,
  value: string,
): Partial<Record<Key, string>> {
  const normalized = value.trim();
  return normalized ? { [key]: normalized } as Record<Key, string> : {};
}

function optionalArea(value: string): { area?: number } {
  return value.trim() ? { area: Number(value) } : {};
}

function toIdempotencyDraft(form: LeadFormValue, privacyPolicyVersion: string) {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    community: form.community.trim(),
    area: form.area.trim(),
    budget: form.budget.trim(),
    start_time: form.start_time.trim(),
    demand: form.demand.trim(),
    consented_at: form.consented_at,
    privacy_policy_version: privacyPolicyVersion,
  };
}

function readableError(error: unknown, fallback: string): string {
  return error instanceof ApiRequestError && error.message.trim()
    ? error.message
    : fallback;
}

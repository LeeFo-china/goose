import type { DouyinAppContext } from "../../app";
import type {
  authorizeDouyinCustomerPhone,
  selectDouyinCustomerIdentity,
  sendDouyinCustomerSmsCode,
  verifyDouyinCustomerSms,
} from "../../api/customer-auth";
import { resolveThemeColor } from "../../components/theme";
import type { CustomerIdentityCandidate, CustomerIdentitySelectionResult } from "../../models";
import type { navigateToPage } from "../../platform/navigation";

type LoginStatus =
  | "idle"
  | "authorizing"
  | "sending"
  | "verifying"
  | "selecting"
  | "choosing";

export type CustomerLoginPageDependencies = {
  getApp(): Pick<DouyinAppContext, "api" | "customerSession" | "startup">;
  authorizeDouyinCustomerPhone: typeof authorizeDouyinCustomerPhone;
  sendDouyinCustomerSmsCode: typeof sendDouyinCustomerSmsCode;
  verifyDouyinCustomerSms: typeof verifyDouyinCustomerSms;
  selectDouyinCustomerIdentity: typeof selectDouyinCustomerIdentity;
  navigateToPage: typeof navigateToPage;
};

export function createCustomerLoginPageDefinition(dependencies: CustomerLoginPageDependencies) {
  return definePage({
    cooldownTimer: null as ReturnType<typeof setInterval> | null,
    cooldownUntil: 0,
    data: {
      status: "idle" as LoginStatus,
      brandName: "装修服务",
      logoUrl: "",
      logoFailed: false,
      primaryColor: "#191817",
      primaryTextColor: "#FFFFFF",
      smsExpanded: false,
      smsCooldown: 0,
      phone: "",
      phoneReady: false,
      code: "",
      phoneError: "",
      codeError: "",
      loginError: "",
      formNotice: "",
      selectionToken: "",
      choosingCandidateId: "",
      candidates: [] as CustomerIdentityCandidate[],
    },
    async onLoad() {
      try {
        const bootstrap = await dependencies.getApp().startup;
        if (!bootstrap) return;
        const theme = resolveThemeColor(bootstrap.theme.primary_color);
        this.setData({
          brandName: bootstrap.company.name,
          logoUrl: bootstrap.company.logo_url || "",
          logoFailed: false,
          primaryColor: theme.primaryColor,
          primaryTextColor: theme.primaryTextColor,
        });
      } catch {
        // Authentication remains available with the safe local brand defaults.
      }
    },
    onShow() { this.resumeCooldown(); },
    onHide() { this.stopCooldown(); },
    onUnload() { this.stopCooldown(); },
    onLogoError() { this.setData({ logoFailed: true }); },
    onToggleSms() {
      if (this.data.status !== "idle") return;
      this.setData({
        smsExpanded: !this.data.smsExpanded,
        loginError: "",
      });
    },
    onPhoneInput(event: { detail: { value?: string } }) {
      const phone = event.detail.value?.trim() ?? "";
      this.setData({
        phone,
        phoneReady: /^1[3-9]\d{9}$/.test(phone),
        phoneError: "",
        formNotice: "",
      });
    },
    onCodeInput(event: { detail: { value?: string } }) {
      this.setData({
        code: event.detail.value?.trim() ?? "",
        codeError: "",
        loginError: "",
      });
    },
    async onDouyinPhone(event: { detail?: { code?: string } }) {
      if (this.data.status !== "idle") return;
      const code = event.detail?.code;
      if (!code) {
        this.setData({ loginError: "未获得手机号授权，可改用短信验证码登录" });
        return;
      }
      await this.runAuth(
        () => dependencies.authorizeDouyinCustomerPhone(dependencies.getApp().api, code),
        "authorizing",
        "idle",
        "客户登录失败，请重试",
      );
    },
    async onSendCode() {
      if (this.data.status !== "idle" || this.data.smsCooldown > 0) return;
      if (!/^1[3-9]\d{9}$/.test(this.data.phone)) {
        this.setData({ phoneError: "请输入正确的手机号", formNotice: "" });
        return;
      }
      this.setData({
        status: "sending",
        phoneError: "",
        loginError: "",
        formNotice: "",
      });
      try {
        const result = await dependencies.sendDouyinCustomerSmsCode(
          dependencies.getApp().api,
          this.data.phone,
        );
        this.setData({
          status: "idle",
          formNotice: "验证码已发送，请注意查收",
        });
        this.startCooldown(result.cooldown_seconds);
      } catch {
        this.setData({
          status: "idle",
          loginError: "验证码发送失败，请稍后重试",
        });
      }
    },
    async onVerifySms() {
      if (this.data.status !== "idle") return;
      const phoneValid = /^1[3-9]\d{9}$/.test(this.data.phone);
      const codeValid = /^\d{4,6}$/.test(this.data.code);
      if (!phoneValid || !codeValid) {
        this.setData({
          phoneError: phoneValid ? "" : "请输入正确的手机号",
          codeError: codeValid ? "" : "请输入 4 至 6 位验证码",
          loginError: "",
        });
        return;
      }
      await this.runAuth(
        () => dependencies.verifyDouyinCustomerSms(
          dependencies.getApp().api,
          { phone: this.data.phone, code: this.data.code },
        ),
        "verifying",
        "idle",
        "客户登录失败，请检查验证码后重试",
      );
    },
    async onSelectCandidate(event: { currentTarget: { dataset: { id?: string } } }) {
      const candidateId = event.currentTarget.dataset.id;
      if (this.data.status !== "selecting" || !candidateId || !this.data.selectionToken) return;
      this.setData({ choosingCandidateId: candidateId });
      await this.runAuth(
        () => dependencies.selectDouyinCustomerIdentity(
          dependencies.getApp().api,
          { selectionToken: this.data.selectionToken, candidateId },
        ),
        "choosing",
        "selecting",
        "身份选择失败，请重试",
      );
    },
    async runAuth(
      operation: () => Promise<CustomerIdentitySelectionResult>,
      pendingStatus: Extract<LoginStatus, "authorizing" | "verifying" | "choosing">,
      failureStatus: Extract<LoginStatus, "idle" | "selecting">,
      failureMessage: string,
    ) {
      this.setData({ status: pendingStatus, loginError: "", formNotice: "" });
      try {
        const result = await operation();
        if (result.status === "selection_required") {
          this.setData({
            status: "selecting",
            selectionToken: result.selection_token,
            choosingCandidateId: "",
            candidates: result.candidates,
          });
          return;
        }
        dependencies.getApp().customerSession.acceptAuth({
          token: result.auth.token,
        });
        await dependencies.navigateToPage("pages/customer-projects/index");
      } catch {
        this.setData({
          status: failureStatus,
          choosingCandidateId: "",
          loginError: failureMessage,
        });
      }
    },
    startCooldown(seconds: number) {
      this.cooldownUntil = Date.now() + seconds * 1_000;
      this.resumeCooldown();
    },
    resumeCooldown() {
      this.stopCooldown();
      const update = () => {
        const remaining = Math.max(0, Math.ceil((this.cooldownUntil - Date.now()) / 1_000));
        this.setData({ smsCooldown: remaining });
        if (remaining === 0) this.stopCooldown();
      };
      update();
      if (this.data.smsCooldown > 0) this.cooldownTimer = setInterval(update, 1_000);
    },
    stopCooldown() {
      if (this.cooldownTimer !== null) clearInterval(this.cooldownTimer);
      this.cooldownTimer = null;
    },
  });
}

function definePage<TData extends Record<string, unknown>, TCustom extends Record<string, unknown>>(
  options: TCustom & { data: TData } & ThisType<TCustom & {
    data: TData; setData(patch: Partial<TData>): void;
  }>,
): TCustom & { data: TData } {
  return options;
}

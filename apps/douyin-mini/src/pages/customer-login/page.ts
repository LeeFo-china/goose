import type { DouyinAppContext } from "../../app";
import type {
  authorizeDouyinCustomerPhone,
  selectDouyinCustomerIdentity,
  sendDouyinCustomerSmsCode,
  verifyDouyinCustomerSms,
} from "../../api/customer-auth";
import type { CustomerIdentityCandidate, CustomerIdentitySelectionResult } from "../../models";
import type { navigateToPage } from "../../platform/navigation";

type LoginStatus = "idle" | "sending" | "verifying" | "selecting";

export type CustomerLoginPageDependencies = {
  getApp(): Pick<DouyinAppContext, "api" | "customerSession">;
  authorizeDouyinCustomerPhone: typeof authorizeDouyinCustomerPhone;
  sendDouyinCustomerSmsCode: typeof sendDouyinCustomerSmsCode;
  verifyDouyinCustomerSms: typeof verifyDouyinCustomerSms;
  selectDouyinCustomerIdentity: typeof selectDouyinCustomerIdentity;
  navigateToPage: typeof navigateToPage;
  showToast(options: { title: string; icon: "none" }): void;
};

export function createCustomerLoginPageDefinition(dependencies: CustomerLoginPageDependencies) {
  return definePage({
    data: {
      status: "idle" as LoginStatus,
      phone: "",
      code: "",
      selectionToken: "",
      candidates: [] as CustomerIdentityCandidate[],
    },
    onPhoneInput(event: { detail: { value?: string } }) {
      this.setData({ phone: event.detail.value?.trim() ?? "" });
    },
    onCodeInput(event: { detail: { value?: string } }) {
      this.setData({ code: event.detail.value?.trim() ?? "" });
    },
    async onDouyinPhone(event: { detail?: { code?: string } }) {
      const code = event.detail?.code;
      if (!code) {
        dependencies.showToast({ title: "未获得手机号授权", icon: "none" });
        return;
      }
      await this.runAuth(() =>
        dependencies.authorizeDouyinCustomerPhone(dependencies.getApp().api, code)
      );
    },
    async onSendCode() {
      if (!/^1[3-9]\d{9}$/.test(this.data.phone)) {
        dependencies.showToast({ title: "请输入正确手机号", icon: "none" });
        return;
      }
      this.setData({ status: "sending" });
      try {
        await dependencies.sendDouyinCustomerSmsCode(
          dependencies.getApp().api,
          this.data.phone,
        );
        this.setData({ status: "idle" });
      } catch {
        this.setData({ status: "idle" });
        dependencies.showToast({ title: "验证码发送失败", icon: "none" });
      }
    },
    async onVerifySms() {
      if (!/^1[3-9]\d{9}$/.test(this.data.phone) || !/^\d{4,6}$/.test(this.data.code)) {
        dependencies.showToast({ title: "请输入手机号和验证码", icon: "none" });
        return;
      }
      await this.runAuth(() => dependencies.verifyDouyinCustomerSms(
        dependencies.getApp().api,
        { phone: this.data.phone, code: this.data.code },
      ));
    },
    async onSelectCandidate(event: { currentTarget: { dataset: { id?: string } } }) {
      const candidateId = event.currentTarget.dataset.id;
      if (!candidateId || !this.data.selectionToken) return;
      await this.runAuth(() => dependencies.selectDouyinCustomerIdentity(
        dependencies.getApp().api,
        { selectionToken: this.data.selectionToken, candidateId },
      ));
    },
    async runAuth(operation: () => Promise<CustomerIdentitySelectionResult>) {
      this.setData({ status: "verifying" });
      try {
        const result = await operation();
        if (result.status === "selection_required") {
          this.setData({
            status: "selecting",
            selectionToken: result.selection_token,
            candidates: result.candidates,
          });
          return;
        }
        dependencies.getApp().customerSession.acceptAuth({
          token: result.auth.token,
        });
        await dependencies.navigateToPage("pages/customer-projects/index");
      } catch {
        this.setData({ status: "idle" });
        dependencies.showToast({ title: "客户登录失败", icon: "none" });
      }
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

import { expect, mock, test } from "bun:test";

import { createCustomerLoginPageDefinition } from "./page";

test("customer login stores auth and navigates after Douyin phone login", async () => {
  const acceptAuth = mock(() => undefined);
  const navigateToPage = mock(async () => undefined);
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth },
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({
      status: "authenticated",
      auth: auth(),
    })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage,
    showToast: mock(() => undefined),
  } as never));

  await page.onDouyinPhone({ detail: { code: "phone-code" } });

  expect(acceptAuth).toHaveBeenCalledWith({ token: "customer-token" });
  expect(navigateToPage).toHaveBeenCalledWith("pages/customer-projects/index");
});

test("customer login shows customer candidates after SMS verify", async () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({ api: {}, customerSession: { acceptAuth: mock(() => undefined) } }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({
      status: "selection_required",
      selection_token: "S".repeat(43),
      expires_in: 300,
      phone_masked: "138****8000",
      candidates: [{
        candidate_id: "11111111-1111-4111-8111-111111111111",
        target_mode: "customer",
        role_label: "客户",
        title: "青禾装饰",
        subtitle: "张三",
        binding_state: "bindable",
      }],
    })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
    showToast: mock(() => undefined),
  } as never));

  page.onPhoneInput({ detail: { value: "13800138000" } });
  page.onCodeInput({ detail: { value: "123456" } });
  await page.onVerifySms();

  expect(page.data.status).toBe("selecting");
  expect(page.data.candidates).toHaveLength(1);
});

function attachSetData<T extends { data: Record<string, unknown> }>(definition: T) {
  return Object.assign(definition, {
    setData(patch: Record<string, unknown>) {
      Object.assign(definition.data, patch);
    },
  });
}

function auth() {
  return {
    token: "customer-token",
    user_id: "auth-user",
    mode: "customer",
    roles: ["customer"],
    verified_phone: "13800138000",
    has_customer_profile: true,
    tenant: { id: "tenant", name: "青禾装饰", slug: "qinghe" },
    customer: { id: "customer", name: "张三", phone: "13800138000" },
  };
}

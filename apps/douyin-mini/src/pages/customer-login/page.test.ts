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

test("customer login expands SMS on demand and adopts the tenant theme", async () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve({
        company: { name: "青禾装饰", logo_url: "https://assets.example.com/logo.png" },
        theme: { primary_color: "#09598b" },
      }),
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
  } as never));

  expect(page.data.smsExpanded).toBe(false);
  page.onToggleSms();
  await page.onLoad();

  expect(page.data.smsExpanded).toBe(true);
  expect(page.data.brandName).toBe("青禾装饰");
  expect(page.data.logoUrl).toBe("https://assets.example.com/logo.png");
  expect(page.data.primaryColor).toBe("#09598b");
  expect(page.data.primaryTextColor).toBe("#FFFFFF");
});

test("customer login records the SMS cooldown without shifting back to another flow", async () => {
  const sendDouyinCustomerSmsCode = mock(async () => ({
    success: true as const,
    cooldown_seconds: 60,
  }));
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode,
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
  } as never));

  page.onToggleSms();
  page.onPhoneInput({ detail: { value: "13800138000" } });
  await page.onSendCode();

  expect(sendDouyinCustomerSmsCode).toHaveBeenCalledTimes(1);
  expect(page.data.status).toBe("idle");
  expect(page.data.smsCooldown).toBe(60);
  expect(page.data.formNotice).toBe("验证码已发送，请注意查收");
  page.onUnload();
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

test("customer login keeps candidates visible when identity selection fails", async () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => {
      throw new Error("network unavailable");
    }),
    navigateToPage: mock(async () => undefined),
  } as never));
  page.data.selectionToken = "S".repeat(43);
  page.data.candidates = [{
    candidate_id: "11111111-1111-4111-8111-111111111111",
    target_mode: "customer",
    role_label: "客户",
    title: "青禾装饰",
    subtitle: "张三",
    binding_state: "bindable",
  }];
  page.data.status = "selecting";

  await page.onSelectCandidate({
    currentTarget: { dataset: { id: "11111111-1111-4111-8111-111111111111" } },
  });

  expect(page.data.status).toBe("selecting");
  expect(page.data.candidates).toHaveLength(1);
  expect(page.data.loginError).toBe("身份选择失败，请重试");
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

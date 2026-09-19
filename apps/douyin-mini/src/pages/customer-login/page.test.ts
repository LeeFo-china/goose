import { expect, mock, test } from "bun:test";

import { ApiRequestError } from "../../api/request";
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
    switchToTab: mock(async () => undefined),
    showToast: mock(() => undefined),
  } as never));

  page.onConsentChange({ detail: { checked: true } });
  await page.onDouyinPhone({ detail: { code: "phone-code" } });

  expect(acceptAuth).toHaveBeenCalledWith({ token: "customer-token", mode: "customer" });
  expect(navigateToPage).toHaveBeenCalledWith("pages/customer-projects/index");
});

test("customer login requires privacy consent before every login method", async () => {
  const authorizeDouyinCustomerPhone = mock(async () => ({ status: "authenticated" as const, auth: auth() }));
  const sendDouyinCustomerSmsCode = mock(async () => ({ success: true as const, cooldown_seconds: 60 }));
  const verifyDouyinCustomerSms = mock(async () => ({ status: "authenticated" as const, auth: auth() }));
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: {
        acceptAuth: mock(() => undefined),
        getAuthState: mock(() => null),
        clear: mock(() => undefined),
      },
    }),
    authorizeDouyinCustomerPhone,
    sendDouyinCustomerSmsCode,
    verifyDouyinCustomerSms,
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
    switchToTab: mock(async () => undefined),
  } as never));
  page.onPhoneInput({ detail: { value: "13800138000" } });
  page.onCodeInput({ detail: { value: "123456" } });

  await page.onDouyinPhone({ detail: { code: "phone-code" } });
  await page.onSendCode();
  await page.onVerifySms();

  expect(authorizeDouyinCustomerPhone).not.toHaveBeenCalled();
  expect(sendDouyinCustomerSmsCode).not.toHaveBeenCalled();
  expect(verifyDouyinCustomerSms).not.toHaveBeenCalled();
  expect(page.data.consentError).toBe("请先阅读并同意隐私政策与用户协议");
});

test("customer login shows a successful empty state for a visitor without projects", async () => {
  const acceptAuth = mock(() => undefined);
  const navigateToPage = mock(async () => undefined);
  const switchToTab = mock(async () => undefined);
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: {
        acceptAuth,
        getAuthState: mock(() => null),
        clear: mock(() => undefined),
      },
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({
      status: "authenticated",
      auth: visitorAuth(),
    })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage,
    switchToTab,
  } as never));

  page.onConsentChange({ detail: { checked: true } });
  await page.onDouyinPhone({ detail: { code: "phone-code" } });

  expect(acceptAuth).toHaveBeenCalledWith({
    token: "visitor-token",
    mode: "platform_visitor",
    phoneMasked: "138****8000",
    expiresIn: 7200,
  });
  expect(navigateToPage).not.toHaveBeenCalledWith("pages/customer-projects/index");
  expect(page.data.authenticatedVisitor).toBe(true);
  expect(page.data.phoneMasked).toBe("138****8000");

  page.onBookMeasurement();
  expect(switchToTab).toHaveBeenCalledWith("lead");
});

test("customer login restores and clears a persisted visitor session", async () => {
  const clear = mock(() => undefined);
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: {
        acceptAuth: mock(() => undefined),
        getAuthState: mock(() => ({ mode: "platform_visitor", phoneMasked: "138****8000" })),
        clear,
      },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
    switchToTab: mock(async () => undefined),
  } as never));

  await page.onLoad();
  expect(page.data.authenticatedVisitor).toBe(true);

  page.onLogout();
  expect(clear).toHaveBeenCalledTimes(1);
  expect(page.data.authenticatedVisitor).toBe(false);
  expect(page.data.consented).toBe(false);
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
  expect(page.data.phoneLoginReady).toBe(true);
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
  page.onConsentChange({ detail: { checked: true } });
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

  page.onConsentChange({ detail: { checked: true } });
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
      throw new ApiRequestError(
        404,
        "CUSTOMER_CONTEXT_MISSING",
        "该手机号未匹配到客户项目，请联系装修公司确认预留手机号",
      );
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

test("editing the phone clears the prior project lookup error", () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
  } as never));
  page.data.loginError =
    "未找到关联项目。该手机号尚未关联装修项目，请联系装修公司确认预留手机号。";

  page.onPhoneInput({ detail: { value: "13900139000" } });

  expect(page.data.loginError).toBe("");
});

test("customer login explains when the authorized phone has no linked project", async () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => {
      throw new ApiRequestError(
        404,
        "CUSTOMER_CONTEXT_MISSING",
        "该手机号未匹配到客户项目，请联系装修公司确认预留手机号",
      );
    }),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
  } as never));

  page.onConsentChange({ detail: { checked: true } });
  await page.onDouyinPhone({ detail: { code: "phone-code" } });

  expect(page.data.loginError).toBe(
    "未找到关联项目。该手机号尚未关联装修项目，请联系装修公司确认预留手机号。",
  );
  expect(page.data.smsExpanded).toBe(false);
});

test("customer login hides unknown backend messages behind the safe fallback", async () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => {
      throw new ApiRequestError(500, "INTERNAL_ERROR", "private upstream detail");
    }),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => ({ status: "authenticated", auth: auth() })),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
  } as never));

  page.onConsentChange({ detail: { checked: true } });
  await page.onDouyinPhone({ detail: { code: "phone-code" } });

  expect(page.data.loginError).toBe("登录客户项目失败，请稍后重试");
  expect(page.data.loginError).not.toContain("private upstream detail");
});

test("SMS login uses the same no-linked-project explanation", async () => {
  const page = attachSetData(createCustomerLoginPageDefinition({
    getApp: () => ({
      api: {},
      customerSession: { acceptAuth: mock(() => undefined) },
      startup: Promise.resolve(null),
    }),
    authorizeDouyinCustomerPhone: mock(async () => ({ status: "authenticated", auth: auth() })),
    sendDouyinCustomerSmsCode: mock(async () => ({ success: true, cooldown_seconds: 60 })),
    verifyDouyinCustomerSms: mock(async () => {
      throw new ApiRequestError(
        404,
        "CUSTOMER_CONTEXT_MISSING",
        "该手机号未匹配到客户项目，请联系装修公司确认预留手机号",
      );
    }),
    selectDouyinCustomerIdentity: mock(async () => ({ status: "authenticated", auth: auth() })),
    navigateToPage: mock(async () => undefined),
  } as never));
  page.onConsentChange({ detail: { checked: true } });
  page.onPhoneInput({ detail: { value: "13800138000" } });
  page.onCodeInput({ detail: { value: "123456" } });

  await page.onVerifySms();

  expect(page.data.loginError).toBe(
    "未找到关联项目。该手机号尚未关联装修项目，请联系装修公司确认预留手机号。",
  );
});

test("customer project login copy makes the business destination explicit", async () => {
  const [config, template] = await Promise.all([
    Bun.file(`${__dirname}/index.json`).text(),
    Bun.file(`${__dirname}/index.ttml`).text(),
  ]);

  expect(config).toContain('"navigationBarTitleText": "登录客户项目"');
  expect(template).toContain("查看我的装修项目");
  expect(template).toContain("使用装修公司预留的手机号，查找并登录您关联的装修项目");
  expect(template).toContain("抖音手机号快捷登录");
  expect(template).toContain("正在登录");
  expect(template).toContain("使用其他手机号登录项目");
  expect(template).toContain("手机号仅用于核验并查找您关联的装修项目");
  expect(template).toContain("当前手机号暂未关联装修项目");
  expect(template).toContain("privacy-consent");
  expect(template).toContain('tt:if="{{consented}}"');
  expect(template).toContain('tt:else');
  expect(template.match(/open-type="getPhoneNumber"/g)).toHaveLength(1);
  expect(template).toContain('bindtap="onDouyinPhone"');
});

function attachSetData<T extends { data: Record<string, unknown> }>(definition: T) {
  return Object.assign(definition, {
    setData(patch: Record<string, unknown>) {
      Object.assign(definition.data, patch);
    },
  });
}

function visitorAuth() {
  return {
    token: "visitor-token",
    user_id: "auth-user",
    mode: "platform_visitor",
    authMode: "platform_visitor",
    roles: ["visitor"],
    verified_phone: "13800138000",
    phone_masked: "138****8000",
    expires_in: 7200,
    has_customer_profile: false,
  };
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

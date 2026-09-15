import { describe, expect, mock, test } from "bun:test";

import type { DouyinAppContext } from "../../app";
import type { SubmitLeadInput, SubmitLeadResult } from "../../api/leads";
import { ApiRequestError } from "../../api/request";
import type { BootstrapData, LaunchContext } from "../../models";
import {
  createLeadPageDefinition,
  type LeadPageDependencies,
} from "./lead-page";

const BOOTSTRAP = {
  installation: { status: "active", template_version: "1.0.0" },
  company: {
    name: "示例装修公司", logo_url: null, summary: null,
    service_phone: "021-12345678", public_address: null,
    address_region: { province: "上海市", city: "上海市", district: null },
    service_regions: [], qualifications: [],
  },
  theme: { primary_color: "#C45A32", navigation_text_color: "white" },
  features: {
    cases: true, sites: true, sms_lead: true,
    douyin_phone: false, phone_capture_mode: "sms",
  },
  content: {
    home_banners: [], trust_metrics: [], featured_projects: [],
    featured_cases: [], active_sites: [],
  },
  privacy_policy_version: "v1",
  contact_sla_text: "工作人员将在营业时间内与你联系",
} satisfies BootstrapData;

describe("lead page definition", () => {
  test("a rapid submit waits for this entry's official video result", async () => {
    const harness = createHarness();
    harness.page.onShow();
    setValidForm(harness.page);
    const official = deferred<LaunchContext>();
    harness.app.getLeadAttribution = () => official.promise;
    const submit = harness.deferredSubmit();
    const operation = harness.page.onSubmit();
    expect(harness.submitLead).not.toHaveBeenCalled();
    official.resolve({ entry_path: "pages/lead/index", scene: "021001",
      source_type: "short_video", analysis_info: { type: 1,
        unique_id: "brand_01", video_item_id: "encrypted-video-1" } });
    await flushPromises();
    expect(harness.submitLead).toHaveBeenCalledWith({}, expect.objectContaining({
      attribution: expect.objectContaining({ analysis_info: {
        type: 1, unique_id: "brand_01", video_item_id: "encrypted-video-1",
      } }),
    }));
    submit.resolve(publicAppointment());
    await operation;
  });

  test("a retry with the same idempotency key keeps its first attribution snapshot", async () => {
    const harness = createHarness();
    harness.page.onShow();
    setValidForm(harness.page);
    const firstSource: LaunchContext = { entry_path: "pages/lead/index", scene: "021001",
      source_type: "direct" };
    const laterSource: LaunchContext = { ...firstSource, source_type: "short_video",
      analysis_info: { type: 1, video_item_id: "late-video" } };
    harness.app.getLeadAttribution = () => firstSource;
    const first = harness.deferredSubmit();
    const firstAttempt = harness.page.onSubmit();
    await flushPromises();
    first.reject(new ApiRequestError(503, "UNAVAILABLE", "暂不可用"));
    await firstAttempt;
    const key = harness.page.idempotency.key;

    harness.app.getLeadAttribution = () => laterSource;
    const retry = harness.deferredSubmit();
    const secondAttempt = harness.page.onSubmit();
    await flushPromises();
    const payloads = harness.submitLead.mock.calls.map(([, body]) => body);
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toMatchObject({ idempotency_key: key, attribution: firstSource });
    expect(payloads[1]).toMatchObject({ idempotency_key: key, attribution: firstSource });
    retry.resolve(publicAppointment());
    await secondAttempt;
  });

  test("a new external entry rotates the submission key", () => {
    const harness = createHarness();
    harness.page.onShow();
    const oldKey = harness.page.idempotency.key;
    harness.page.onHide();
    harness.app.attributionEntryVersion = 2;
    harness.page.onShow();
    expect(harness.page.idempotency.key).not.toBe(oldKey);
  });

  test("a hidden submit cannot send after a delayed attribution callback", async () => {
    const harness = createHarness();
    harness.page.onShow();
    setValidForm(harness.page);
    const official = deferred<LaunchContext>();
    harness.app.getLeadAttribution = () => official.promise;
    const operation = harness.page.onSubmit();
    harness.page.onHide();
    official.resolve({ entry_path: "pages/lead/index", scene: "021001",
      source_type: "short_video", analysis_info: { type: 1,
        video_item_id: "encrypted-video-1" } });
    await operation;
    expect(harness.submitLead).not.toHaveBeenCalled();
  });

  test("a stale privacy refresh cannot write or unlock a newer page submit", async () => {
    const harness = createHarness();
    harness.page.onShow();
    setValidForm(harness.page);
    const staleSubmit = harness.deferredSubmit();
    const staleOperation = harness.page.onSubmit();
    staleSubmit.reject(privacyMismatch());
    await flushPromises();
    expect(harness.bootstrapLoads).toHaveLength(1);

    harness.page.onHide();
    harness.page.onShow();
    const currentSubmit = harness.deferredSubmit();
    const currentOperation = harness.page.onSubmit();
    await flushPromises();
    expect(harness.submitLead).toHaveBeenCalledTimes(2);
    const currentState = harness.page.idempotency;
    harness.setData.mockClear();

    harness.bootstrapLoads[0]!.resolve({ ...BOOTSTRAP, privacy_policy_version: "v2" });
    await staleOperation;

    expect(harness.setData.mock.calls.map(([patch]) => patch)).toEqual([]);
    expect(harness.page.idempotency).toEqual(currentState);
    expect(harness.page.idempotency.status).toBe("submitting");
    await harness.page.onSubmit();
    expect(harness.submitLead).toHaveBeenCalledTimes(2);

    currentSubmit.reject(new ApiRequestError(503, "UNAVAILABLE", "暂不可用"));
    await currentOperation;
  });

  test("an unloaded page ignores a rejecting nested privacy refresh", async () => {
    const harness = createHarness();
    harness.page.onShow();
    setValidForm(harness.page);
    const submit = harness.deferredSubmit();
    const operation = harness.page.onSubmit();
    submit.reject(privacyMismatch());
    await flushPromises();
    expect(harness.bootstrapLoads).toHaveLength(1);
    harness.setData.mockClear();

    harness.page.onUnload();
    harness.bootstrapLoads[0]!.reject(new Error("refresh failed"));
    await operation;

    expect(harness.setData).not.toHaveBeenCalled();
  });

  test("a current privacy refresh updates consent and policy exactly once", async () => {
    const harness = createHarness();
    harness.page.onShow();
    setValidForm(harness.page);
    const submit = harness.deferredSubmit();
    const operation = harness.page.onSubmit();
    submit.reject(privacyMismatch());
    await flushPromises();
    harness.setData.mockClear();

    harness.bootstrapLoads[0]!.resolve({ ...BOOTSTRAP, privacy_policy_version: "v2" });
    await operation;

    const policyWrites = harness.setData.mock.calls
      .map(([patch]) => patch)
      .filter((patch) => patch.privacyPolicyVersion === "v2");
    expect(policyWrites).toHaveLength(1);
    expect(harness.page.data).toMatchObject({
      submitting: false,
      consented: false,
      privacyPolicyVersion: "v2",
    });
    expect(harness.page.data.form.consented_at).toBe("");
  });

  test("presents official Douyin phone capture only from bootstrap configuration", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();

    expect(harness.page.data).toMatchObject({
      douyinPhoneEnabled: true,
    });
    expect(harness.page.data).not.toHaveProperty("douyinClueComponentId");

    expect(harness.page.data.form.phone).toBe("");
    expect(harness.page.data.phoneReady).toBe(false);
  });

  test("captures a Douyin phone code before the final form submission", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();
    setValidForm(harness.page);
    harness.page.data.form = {
      ...harness.page.data.form,
      phone: "",
      sms_code: "",
    };
    harness.page.onDouyinPhoneNumber({
      detail: { douyin_phone_code: "official-phone-code" },
    });

    expect(harness.submitLead).not.toHaveBeenCalled();
    expect(harness.page.data).toMatchObject({
      douyinPhoneAuthorized: true,
      form: { phone: "", sms_code: "" },
      phoneReady: false,
      formError: "",
    });

    const submit = harness.deferredSubmit();
    const operation = harness.page.onSubmit();
    submit.resolve(publicAppointment());
    await operation;

    expect(harness.submitLead).toHaveBeenCalledWith({}, expect.objectContaining({
      verification_method: "douyin_phone",
      douyin_phone_code: "official-phone-code",
    }));
    const payload = harness.submitLead.mock.calls[0]![1] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("phone");
    expect(payload).not.toHaveProperty("sms_code");
  });

  test("falls back to SMS when Douyin does not return a phone code", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();

    harness.page.onDouyinPhoneNumber({ detail: { douyin_phone_code: "" } });

    expect(harness.submitLead).not.toHaveBeenCalled();
    expect(harness.page.data).toMatchObject({
      submitting: false,
      focusedField: "phone",
      douyinPhoneAuthorized: false,
      formError: "未获得抖音手机号授权，也可以手动输入手机号",
    });
  });

  test("submits a manually entered phone with SMS when Douyin is also enabled", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();
    setValidForm(harness.page);

    const submit = harness.deferredSubmit();
    const operation = harness.page.onSubmit();
    submit.resolve(publicAppointment());
    await operation;

    expect(harness.submitLead).toHaveBeenCalledWith({}, expect.objectContaining({
      verification_method: "sms",
      phone: "13800138000",
      sms_code: "123456",
    }));
  });

  test("rejects an expired Douyin phone authorization", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();
    setValidForm(harness.page);
    harness.page.onDouyinPhoneNumber({
      detail: { douyin_phone_code: "expired-phone-code" },
    });
    harness.page.douyinPhoneAuthorization!.expiresAt = Date.now() - 1;

    await harness.page.onSubmit();

    expect(harness.submitLead).not.toHaveBeenCalled();
    expect(harness.page.data).toMatchObject({
      douyinPhoneAuthorized: false,
      formError: "手机号授权已过期，请重新获取",
      fieldErrors: { phone: "手机号授权已过期，请重新获取" },
    });
  });

  test("clears an unconsumed phone authorization when the page is hidden", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();
    harness.page.onShow();
    harness.page.onDouyinPhoneNumber({
      detail: { douyin_phone_code: "page-scoped-phone-code" },
    });

    harness.page.onHide();
    harness.page.onShow();

    expect(harness.page.douyinPhoneAuthorization).toBeNull();
    expect(harness.page.data.douyinPhoneAuthorized).toBe(false);
  });

  test("typing a phone after authorization switches back to SMS submission", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
      },
    });
    harness.page.onLoad();
    await flushPromises();
    setValidForm(harness.page);
    harness.page.onDouyinPhoneNumber({
      detail: { douyin_phone_code: "official-phone-code" },
    });
    harness.page.onFieldChange({ detail: { field: "phone", value: "13800138000" } });
    harness.page.onFieldChange({ detail: { field: "sms_code", value: "123456" } });
    expect(harness.page.data).toMatchObject({
      douyinPhoneAuthorized: false,
      form: { phone: "13800138000", sms_code: "123456" },
    });

    const submit = harness.deferredSubmit();
    const operation = harness.page.onSubmit();
    submit.resolve(publicAppointment());
    await operation;

    expect(harness.submitLead).toHaveBeenCalledWith({}, expect.objectContaining({
      verification_method: "sms",
      phone: "13800138000",
      sms_code: "123456",
    }));
  });

  test("a stale policy rejection cannot write or unlock current page navigation", async () => {
    const harness = createHarness();
    harness.page.onShow();
    const staleNavigation = harness.deferredNavigation();
    harness.page.onOpenPolicy();
    harness.page.onHide();
    harness.page.onShow();
    const currentNavigation = harness.deferredNavigation();
    harness.page.onOpenPolicy();
    expect(harness.navigateToPage).toHaveBeenCalledTimes(2);
    harness.setData.mockClear();

    staleNavigation.reject(new Error("stale navigation failed"));
    await flushPromises();
    expect(harness.setData.mock.calls.map(([patch]) => patch)).toEqual([]);
    harness.page.onOpenPolicy();
    expect(harness.navigateToPage).toHaveBeenCalledTimes(2);

    currentNavigation.reject(new Error("current navigation failed"));
    await flushPromises();
    expect(harness.setData.mock.calls.map(([patch]) => patch.formError))
      .toEqual(["隐私政策页面打开失败，请稍后重试"]);
    harness.deferredNavigation();
    harness.page.onOpenPolicy();
    expect(harness.navigateToPage).toHaveBeenCalledTimes(3);
  });
});

type LeadPageDefinition = ReturnType<typeof createLeadPageDefinition>;
type TestLeadPage = LeadPageDefinition & {
  setData(patch: Partial<LeadPageDefinition["data"]>): void;
};

function createHarness(bootstrap: BootstrapData = BOOTSTRAP) {
  const submitFlights: Array<Deferred<SubmitLeadResult>> = [];
  const bootstrapLoads: Array<Deferred<BootstrapData | null>> = [];
  const navigationFlights: Array<Deferred<void>> = [];
  const submitLead = mock((_client: unknown, _input: SubmitLeadInput) =>
    submitFlights.shift()?.promise
    ?? Promise.reject(new Error("missing submit flight")));
  const navigateToPage = mock(() => navigationFlights.shift()?.promise
    ?? Promise.reject(new Error("missing navigation flight")));
  const app = {
    api: {},
    bootstrap: {
      load: () => {
        const flight = deferred<BootstrapData | null>();
        bootstrapLoads.push(flight);
        return flight.promise;
      },
      getReadyOrLoad: async () => bootstrap,
    },
    startup: Promise.resolve(bootstrap),
    launchContext: {
      entry_path: "pages/lead/index", scene: "0", source_type: "direct",
    },
    attributionEntryVersion: 1,
    getLeadAttribution: () => ({
      entry_path: "pages/lead/index", scene: "0", source_type: "direct",
    }),
    recordAnalytics: mock(() => undefined),
  } as unknown as DouyinAppContext;
  const dependencies = {
    getApp: () => app,
    sendLeadSms: async () => ({ success: true as const, cooldown_seconds: 60 }),
    submitLead,
    readBudgetLeadContext: () => null,
    readMeasurementSuccessContext: () => null,
    writeMeasurementSuccessContext: () => true,
    navigateToPage,
    showToast: () => undefined,
    makePhoneCall: () => undefined,
  } satisfies LeadPageDependencies;
  const definition = createLeadPageDefinition(dependencies);
  let page!: TestLeadPage;
  const setData = mock((patch: Partial<LeadPageDefinition["data"]>) => {
    page.data = { ...page.data, ...patch };
  });
  page = Object.assign(definition, { setData }) as TestLeadPage;
  page.data = { ...page.data, loading: false };

  return {
    page, app, setData, submitLead, navigateToPage, bootstrapLoads,
    deferredSubmit() {
      const flight = deferred<SubmitLeadResult>();
      submitFlights.push(flight);
      return flight;
    },
    deferredNavigation() {
      const flight = deferred<void>();
      navigationFlights.push(flight);
      return flight;
    },
  };
}

function setValidForm(page: TestLeadPage): void {
  page.data = {
    ...page.data,
    privacyPolicyVersion: "v1",
    consented: true,
    form: {
      name: "李先生", phone: "13800138000", sms_code: "123456",
      community: "静安花园", preferred_visit_date: "2099-01-01",
      preferred_visit_period: "morning", demand: "",
      consented_at: "2098-12-01T00:00:00.000Z",
    },
  };
}

function privacyMismatch(): ApiRequestError {
  return new ApiRequestError(
    409,
    "DOUYIN_PRIVACY_POLICY_VERSION_MISMATCH",
    "隐私版本已更新",
  );
}

function publicAppointment(): SubmitLeadResult {
  return {
    lead_id: "44444444-4444-4444-8444-444444444444",
    appointment_no: "DYLF-20260719-000001",
    already_submitted: false,
    existing_customer_linked: false,
    status: "pending_confirmation",
    message: "量房申请已提交，工作人员将与你确认具体时间",
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

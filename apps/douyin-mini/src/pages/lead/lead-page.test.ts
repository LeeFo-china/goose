import { describe, expect, mock, test } from "bun:test";

import type { DouyinAppContext } from "../../app";
import type { SubmitLeadResult } from "../../api/leads";
import { ApiRequestError } from "../../api/request";
import type { BootstrapData } from "../../models";
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

  test("presents official Douyin clue phone capture only from bootstrap configuration", async () => {
    const harness = createHarness({
      ...BOOTSTRAP,
      features: {
        ...BOOTSTRAP.features,
        douyin_phone: true,
        phone_capture_mode: "douyin_phone",
        clue_component_id: "clue_1234567890",
      },
    });
    harness.page.onLoad();
    await flushPromises();

    expect(harness.page.data).toMatchObject({
      douyinClueEnabled: true,
      douyinClueComponentId: "clue_1234567890",
    });

    expect(harness.page.data.form.phone).toBe("");
    expect(harness.page.data.phoneReady).toBe(false);
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
  const submitLead = mock(() => submitFlights.shift()?.promise
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
    page, setData, submitLead, navigateToPage, bootstrapLoads,
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
